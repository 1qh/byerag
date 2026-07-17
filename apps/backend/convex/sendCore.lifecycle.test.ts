import { describe, expect, test } from 'bun:test'
import type { Id } from './_generated/dataModel'
import { makeTest } from '../test-utils/convex'
import { authed } from '../test-utils/messages-helpers'
import { internal } from './_generated/api'
import { hashSecret } from './secretHash'

const seedExistingChat = async (
  t: ReturnType<typeof makeTest>,
  owner: string,
  options: { secret?: string; streaming?: boolean } = {}
): Promise<{ chatId: Id<'chats'>; secret: string }> => {
  const secret = options.secret ?? 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const secretHash = await hashSecret(secret)
  const now = Date.now()
  const chatId = await t.run(async ctx =>
    ctx.db.insert('chats', {
      app: 'user',
      messageCount: 1,
      owner,
      secretHash,
      streaming: options.streaming ?? false,
      streamingStartedAt: now,
      title: 'seed',
      turns: 1,
      updatedAt: now
    })
  )
  await t.run(async ctx => {
    await ctx.db.insert('chatRuntime', { chatId, proxyCallsThisTurn: 0, streamEventCount: 0 })
  })
  return { chatId, secret }
}
describe('sendCore validation', () => {
  test('empty content rejected', async () => {
    const t = makeTest()
    await expect(
      t.mutation(internal.messages.sendInternal, { app: 'user', content: '   ', email: 'a@x' })
    ).rejects.toThrow('empty message')
  })
  test('overlong content rejected', async () => {
    const t = makeTest()
    await expect(
      t.mutation(internal.messages.sendInternal, { app: 'user', content: 'x'.repeat(200_000), email: 'a@x' })
    ).rejects.toThrow('message too long')
  })
})
describe('sendCore concurrent-stream cap', () => {
  test('rejects beyond MAX_CONCURRENT_AGENTS=3 streaming chats', async () => {
    const t = makeTest()
    const owner = 'cap@x'
    await t.run(async ctx => {
      const now = Date.now()
      for (let i = 0; i < 3; i += 1)
        await ctx.db.insert('chats', {
          app: 'user',
          messageCount: 1,
          owner,
          secretHash: 'h'.repeat(64),
          streaming: true,
          streamingStartedAt: now,
          title: `t${i}`,
          turns: 1,
          updatedAt: now
        })
    })
    await expect(
      t.mutation(internal.messages.sendInternal, { app: 'user', content: 'hello', email: owner })
    ).rejects.toThrow(/Too many concurrent sessions/u)
  })
})
describe('sendCore existing chat', () => {
  test('throws on chat-not-found', async () => {
    const t = makeTest()
    const chatId = await t.run(async ctx =>
      ctx.db.insert('chats', {
        app: 'user',
        messageCount: 0,
        owner: 'a@x',
        secretHash: 'h'.repeat(64),
        streaming: false,
        streamingStartedAt: Date.now(),
        title: 't',
        turns: 1,
        updatedAt: Date.now()
      })
    )
    await t.run(async ctx => {
      await ctx.db.delete(chatId)
    })
    await expect(
      t.mutation(internal.messages.sendInternal, { app: 'user', chatId, content: 'x', email: 'a@x' })
    ).rejects.toThrow('chat not found')
  })
  test('throws on owner mismatch', async () => {
    const t = makeTest()
    const { chatId } = await seedExistingChat(t, 'owner-a@x')
    await expect(
      t.mutation(internal.messages.sendInternal, { app: 'user', chatId, content: 'x', email: 'attacker@x' })
    ).rejects.toThrow('unauthorized')
  })
  test('throws if chat is busy', async () => {
    const t = makeTest()
    const { chatId } = await seedExistingChat(t, 'busy@x', { streaming: true })
    await expect(
      t.mutation(internal.messages.sendInternal, { app: 'user', chatId, content: 'x', email: 'busy@x' })
    ).rejects.toThrow('chat is busy')
  })
  test('rotates secret on existing chat (new secret hash differs)', async () => {
    const t = makeTest()
    const { chatId, secret } = await seedExistingChat(t, 'rot@x')
    const oldHash = await hashSecret(secret)
    await t.mutation(internal.messages.sendInternal, { app: 'user', chatId, content: 'second turn', email: 'rot@x' })
    const after = await t.run(async ctx => ctx.db.get(chatId))
    expect(after?.secretHash).not.toBe(oldHash)
  })
  test('clears prior streamEvents on follow-up turn', async () => {
    const t = makeTest()
    const { chatId } = await seedExistingChat(t, 'clean@x')
    await t.run(async ctx => {
      for (let i = 0; i < 5; i += 1) await ctx.db.insert('streamEvents', { chatId, content: `{"i":${i}}`, seq: i })
    })
    await t.mutation(internal.messages.sendInternal, { app: 'user', chatId, content: 'next', email: 'clean@x' })
    const remaining = await t.run(async ctx =>
      ctx.db
        .query('streamEvents')
        .withIndex('by_chat', q => q.eq('chatId', chatId))
        .collect()
    )
    expect(remaining).toHaveLength(0)
  })
  test('increments turns and messageCount', async () => {
    const t = makeTest()
    const { chatId } = await seedExistingChat(t, 'inc@x')
    await t.mutation(internal.messages.sendInternal, { app: 'user', chatId, content: 'next', email: 'inc@x' })
    const after = await t.run(async ctx => ctx.db.get(chatId))
    expect(after?.turns).toBe(2)
    expect(after?.messageCount).toBe(2)
  })
})
describe('chats.abort', () => {
  test('rotates secret and sets streaming=false', async () => {
    const t = makeTest()
    const { chatId, secret } = await seedExistingChat(t, 'ab@x', { streaming: true })
    const oldHash = await hashSecret(secret)
    const { api } = await import('./_generated/api')
    const auth = await authed(t, 'ab@x')
    await auth.mutation(api.chats.abort, { app: 'user', chatId })
    const after = await t.run(async ctx => ctx.db.get(chatId))
    expect(after?.streaming).toBe(false)
    expect(after?.secretHash).not.toBe(oldHash)
  })
  test('inserts SEQ_SERVER_ERROR exactly once even if abort called twice', async () => {
    const t = makeTest()
    const { chatId } = await seedExistingChat(t, 'ab2@x', { streaming: true })
    const { api } = await import('./_generated/api')
    const auth = await authed(t, 'ab2@x')
    await auth.mutation(api.chats.abort, { app: 'user', chatId })
    await t.run(async ctx => {
      await ctx.db.patch(chatId, { streaming: true, streamingStartedAt: Date.now() })
    })
    await auth.mutation(api.chats.abort, { app: 'user', chatId })
    const errEvents = await t.run(async ctx =>
      ctx.db
        .query('streamEvents')
        .withIndex('by_chat_seq', q => q.eq('chatId', chatId).eq('seq', -1))
        .collect()
    )
    expect(errEvents).toHaveLength(1)
  })
  test('preserves shared sandbox when other chats are streaming for same owner', async () => {
    const t = makeTest()
    const owner = 'shared@x'
    const { chatId: chat1 } = await seedExistingChat(t, owner, { streaming: true })
    await t.run(async ctx => {
      await ctx.db.insert('chats', {
        app: 'user',
        messageCount: 0,
        owner,
        secretHash: 'h'.repeat(64),
        streaming: true,
        streamingStartedAt: Date.now(),
        title: 'other',
        turns: 1,
        updatedAt: Date.now()
      })
    })
    await t.mutation(internal.sandboxes.upsert, { owner, sandboxId: 'shared-sb' })
    const { api } = await import('./_generated/api')
    await (await authed(t, owner)).mutation(api.chats.abort, { app: 'user', chatId: chat1 })
    const sb = await t.query(internal.sandboxes.getByOwner, { owner })
    expect(sb?.sandboxId).toBe('shared-sb')
  })
  test('removes sandbox when no other chat is streaming', async () => {
    const t = makeTest()
    const owner = 'lone@x'
    const { chatId } = await seedExistingChat(t, owner, { streaming: true })
    await t.mutation(internal.sandboxes.upsert, { owner, sandboxId: 'lone-sb' })
    const { api } = await import('./_generated/api')
    await (await authed(t, owner)).mutation(api.chats.abort, { app: 'user', chatId })
    const sb = await t.query(internal.sandboxes.getByOwner, { owner })
    expect(sb).toBeNull()
  })
  test('no-ops on non-streaming chat', async () => {
    const t = makeTest()
    const { chatId } = await seedExistingChat(t, 'noop@x', { streaming: false })
    const before = await t.run(async ctx => ctx.db.get(chatId))
    const { api } = await import('./_generated/api')
    await (await authed(t, 'noop@x')).mutation(api.chats.abort, { app: 'user', chatId })
    const after = await t.run(async ctx => ctx.db.get(chatId))
    expect(after?.secretHash).toBe(before?.secretHash ?? '')
  })
})
