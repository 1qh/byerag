/* oxlint-disable eslint(no-await-in-loop) */
import { describe, expect, test } from 'bun:test'
import type { Id } from './_generated/dataModel'
import { makeTest } from '../test-utils/convex'
import { internal } from './_generated/api'
import { hashSecret } from './secretHash'
const SECRET = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const seedStreaming = async (
  t: ReturnType<typeof makeTest>,
  options: { messageCount?: number; owner?: string } = {}
): Promise<{ chatId: Id<'chats'>; secret: string }> => {
  const secretHash = await hashSecret(SECRET)
  const chatId = await t.run(async ctx =>
    ctx.db.insert('chats', {
      messageCount: options.messageCount ?? 0,
      owner: options.owner ?? 'cmp@x',
      secretHash,
      streaming: true,
      streamingStartedAt: Date.now(),
      title: 't',
      turns: 1,
      updatedAt: Date.now()
    })
  )
  await t.run(async ctx => {
    await ctx.db.insert('chatRuntime', { chatId, proxyCallsThisTurn: 0, streamEventCount: 0 })
  })
  return { chatId, secret: SECRET }
}
const seedEvents = async (
  t: ReturnType<typeof makeTest>,
  chatId: Id<'chats'>,
  events: { content: string; seq: number }[]
): Promise<void> => {
  await t.run(async ctx => {
    for (const e of events) await ctx.db.insert('streamEvents', { chatId, content: e.content, seq: e.seq })
  })
}
const messagesOf = async (
  t: ReturnType<typeof makeTest>,
  chatId: Id<'chats'>
): Promise<{ content: string; seq: number; type: string }[]> =>
  t.run(async ctx => {
    const rows = await ctx.db
      .query('messages')
      .withIndex('by_chat_seq', q => q.eq('chatId', chatId))
      .collect()
    return rows.map(r => ({ content: r.content, seq: r.seq, type: r.type }))
  })
describe('complete: secret rotation + cleanup', () => {
  test('rejects invalid secret (constant-time)', async () => {
    const t = makeTest()
    const { chatId } = await seedStreaming(t)
    await expect(t.mutation(internal.messages.complete, { chatId, secret: 'not-the-secret' })).rejects.toThrow(
      'unauthorized'
    )
  })
  test('rotates secret on success (old hash invalidated)', async () => {
    const t = makeTest()
    const { chatId, secret } = await seedStreaming(t)
    const oldHash = await hashSecret(secret)
    await t.mutation(internal.messages.complete, { chatId, secret })
    const after = await t.run(async ctx => ctx.db.get(chatId))
    expect(after?.secretHash).not.toBe(oldHash)
    expect(after?.streaming).toBe(false)
  })
  test('throws when chat is not streaming', async () => {
    const t = makeTest()
    const { chatId, secret } = await seedStreaming(t)
    await t.run(async ctx => {
      await ctx.db.patch(chatId, { streaming: false })
    })
    await expect(t.mutation(internal.messages.complete, { chatId, secret })).rejects.toThrow('chat not streaming')
  })
  test('returns silently when chat does not exist', async () => {
    const t = makeTest()
    const { chatId, secret } = await seedStreaming(t)
    await t.run(async ctx => {
      await ctx.db.delete(chatId)
    })
    await expect(t.mutation(internal.messages.complete, { chatId, secret })).rejects.toThrow('unauthorized')
  })
})
describe('complete: event consumption and message persistence', () => {
  test('promotes user/assistant/result types into messages', async () => {
    const t = makeTest()
    const { chatId, secret } = await seedStreaming(t)
    await seedEvents(t, chatId, [
      { content: JSON.stringify({ message: { content: [{ text: 'q' }], role: 'user' }, type: 'user' }), seq: 0 },
      {
        content: JSON.stringify({ message: { content: [{ text: 'a' }], role: 'assistant' }, type: 'assistant' }),
        seq: 1
      },
      { content: JSON.stringify({ subtype: 'success', type: 'result' }), seq: 2 }
    ])
    await t.mutation(internal.messages.complete, { chatId, secret })
    const msgs = await messagesOf(t, chatId)
    expect(msgs.map(m => m.type)).toEqual(['user', 'assistant', 'result'])
  })
  test('drops events with unknown type', async () => {
    const t = makeTest()
    const { chatId, secret } = await seedStreaming(t)
    await seedEvents(t, chatId, [
      { content: JSON.stringify({ type: 'totally_unknown' }), seq: 0 },
      { content: JSON.stringify({ type: 'assistant' }), seq: 1 }
    ])
    await t.mutation(internal.messages.complete, { chatId, secret })
    const msgs = await messagesOf(t, chatId)
    expect(msgs.length).toBe(1)
    expect(msgs[0]?.type).toBe('assistant')
  })
  test('drops events with malformed JSON', async () => {
    const t = makeTest()
    const { chatId, secret } = await seedStreaming(t)
    await seedEvents(t, chatId, [
      { content: '{not json', seq: 0 },
      { content: JSON.stringify({ type: 'user' }), seq: 1 }
    ])
    await t.mutation(internal.messages.complete, { chatId, secret })
    const msgs = await messagesOf(t, chatId)
    expect(msgs.length).toBe(1)
  })
  test('deletes ALL streamEvents after consumption', async () => {
    const t = makeTest()
    const { chatId, secret } = await seedStreaming(t)
    await seedEvents(t, chatId, [
      { content: JSON.stringify({ type: 'user' }), seq: 0 },
      { content: JSON.stringify({ type: 'assistant' }), seq: 1 }
    ])
    await t.mutation(internal.messages.complete, { chatId, secret })
    const remaining = await t.run(async ctx =>
      ctx.db
        .query('streamEvents')
        .withIndex('by_chat', q => q.eq('chatId', chatId))
        .collect()
    )
    expect(remaining.length).toBe(0)
  })
  test('reads events across multiple batches (>200 events)', async () => {
    const t = makeTest()
    const { chatId, secret } = await seedStreaming(t)
    const events = Array.from({ length: 250 }, (_, i) => ({
      content: JSON.stringify({ type: 'assistant' }),
      seq: i
    }))
    await seedEvents(t, chatId, events)
    await t.mutation(internal.messages.complete, { chatId, secret })
    const msgs = await messagesOf(t, chatId)
    expect(msgs.length).toBe(250)
  })
})
describe('complete: truncation', () => {
  test('inserts truncation marker when events exceed COMPLETE_INSERT_CAP=2000', async () => {
    const t = makeTest()
    const { chatId, secret } = await seedStreaming(t)
    const events = Array.from({ length: 2001 }, (_, i) => ({
      content: JSON.stringify({ type: 'assistant' }),
      seq: i
    }))
    await seedEvents(t, chatId, events)
    await t.mutation(internal.messages.complete, { chatId, secret })
    const msgs = await messagesOf(t, chatId)
    expect(msgs.length).toBe(2001)
    expect(msgs.at(-1)?.type).toBe('error')
    expect(msgs.at(-1)?.content).toContain('truncated: too many messages this turn')
  })
  test('inserts truncation marker when message-cap (5000) is reached', async () => {
    const t = makeTest()
    const { chatId, secret } = await seedStreaming(t, { messageCount: 4998 })
    await seedEvents(t, chatId, [
      { content: JSON.stringify({ type: 'assistant' }), seq: 0 },
      { content: JSON.stringify({ type: 'assistant' }), seq: 1 },
      { content: JSON.stringify({ type: 'assistant' }), seq: 2 }
    ])
    await t.mutation(internal.messages.complete, { chatId, secret })
    const all = await t.run(async ctx =>
      ctx.db
        .query('messages')
        .withIndex('by_chat', q => q.eq('chatId', chatId))
        .collect()
    )
    const errs = all.filter(m => m.type === 'error')
    expect(errs.length).toBeGreaterThan(0)
    expect(errs[0]?.content).toContain('chat message cap reached')
  })
  test('rejects single oversized event content (>500KB)', async () => {
    const t = makeTest()
    const { chatId, secret } = await seedStreaming(t)
    const huge = JSON.stringify({ huge: 'x'.repeat(600_000), type: 'assistant' })
    await seedEvents(t, chatId, [{ content: huge, seq: 0 }])
    await expect(t.mutation(internal.messages.complete, { chatId, secret })).rejects.toThrow('message too large')
  })
  test('rejects total payload >10MB', async () => {
    const t = makeTest()
    const { chatId, secret } = await seedStreaming(t)
    const events = Array.from({ length: 25 }, (_, i) => ({
      content: JSON.stringify({ pad: 'x'.repeat(450_000), type: 'assistant' }),
      seq: i
    }))
    await seedEvents(t, chatId, events)
    await expect(t.mutation(internal.messages.complete, { chatId, secret })).rejects.toThrow('complete payload too large')
  })
})
describe('complete: sessionId handling', () => {
  test('valid sessionId is persisted', async () => {
    const t = makeTest()
    const { chatId, secret } = await seedStreaming(t)
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    await t.mutation(internal.messages.complete, { chatId, secret, sessionId })
    const after = await t.run(async ctx => ctx.db.get(chatId))
    expect(after?.sessionId).toBe(sessionId)
  })
  test('invalid sessionId is dropped', async () => {
    const t = makeTest()
    const { chatId, secret } = await seedStreaming(t)
    await t.mutation(internal.messages.complete, { chatId, secret, sessionId: 'not-a-uuid' })
    const after = await t.run(async ctx => ctx.db.get(chatId))
    expect(after?.sessionId).toBeUndefined()
  })
  test('omitted sessionId is fine', async () => {
    const t = makeTest()
    const { chatId, secret } = await seedStreaming(t)
    await t.mutation(internal.messages.complete, { chatId, secret })
    const after = await t.run(async ctx => ctx.db.get(chatId))
    expect(after?.sessionId).toBeUndefined()
  })
})
describe('complete: runtime cleanup', () => {
  test('resets streamEventCount and proxyCallsThisTurn', async () => {
    const t = makeTest()
    const { chatId, secret } = await seedStreaming(t)
    await t.run(async ctx => {
      const rt = await ctx.db
        .query('chatRuntime')
        .withIndex('by_chat', q => q.eq('chatId', chatId))
        .unique()
      if (rt) await ctx.db.patch(rt._id, { proxyCallsThisTurn: 50, streamEventCount: 100 })
    })
    await t.mutation(internal.messages.complete, { chatId, secret })
    const rt = await t.run(async ctx =>
      ctx.db
        .query('chatRuntime')
        .withIndex('by_chat', q => q.eq('chatId', chatId))
        .unique()
    )
    expect(rt?.streamEventCount).toBe(0)
    expect(rt?.proxyCallsThisTurn).toBe(0)
  })
})
