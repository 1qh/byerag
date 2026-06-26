import { describe, expect, test } from 'bun:test'
import type { Id } from './_generated/dataModel'
import { makeTest } from '../test-utils/convex'
import { internal } from './_generated/api'

const seedChat = async (t: ReturnType<typeof makeTest>): Promise<Id<'chats'>> =>
  t.run(async ctx =>
    ctx.db.insert('chats', {
      app: 'user',
      messageCount: 0,
      owner: 'rt@x',
      secretHash: 'a'.repeat(64),
      streaming: true,
      streamingStartedAt: Date.now(),
      title: 't',
      turns: 1,
      updatedAt: Date.now()
    })
  )
const seedRuntime = async (
  t: ReturnType<typeof makeTest>,
  chatId: Id<'chats'>,
  fields: { proxyCallsThisTurn?: number; streamEventCount?: number } = {}
): Promise<void> => {
  await t.run(async ctx => {
    await ctx.db.insert('chatRuntime', {
      chatId,
      proxyCallsThisTurn: fields.proxyCallsThisTurn ?? 0,
      streamEventCount: fields.streamEventCount ?? 0
    })
  })
}
const getRt = async (
  t: ReturnType<typeof makeTest>,
  chatId: Id<'chats'>
): Promise<null | { proxyCallsThisTurn?: number; streamEventCount: number }> =>
  t.run(async ctx =>
    ctx.db
      .query('chatRuntime')
      .withIndex('by_chat', q => q.eq('chatId', chatId))
      .unique()
  )
describe('chatRuntime.consumeProxyCallBudget', () => {
  test('returns true and increments counter under cap', async () => {
    const t = makeTest()
    const chatId = await seedChat(t)
    await seedRuntime(t, chatId)
    const ok = await t.mutation(internal.chatRuntime.consumeProxyCallBudget, { chatId })
    expect(ok).toBe(true)
    const rt = await getRt(t, chatId)
    expect(rt?.proxyCallsThisTurn).toBe(1)
  })
  test('rejects after 200 calls (PROXY_CALLS_PER_TURN_CAP)', async () => {
    const t = makeTest()
    const chatId = await seedChat(t)
    await seedRuntime(t, chatId, { proxyCallsThisTurn: 200 })
    const ok = await t.mutation(internal.chatRuntime.consumeProxyCallBudget, { chatId })
    expect(ok).toBe(false)
    const rt = await getRt(t, chatId)
    expect(rt?.proxyCallsThisTurn).toBe(200)
  })
  test('returns false when runtime row missing', async () => {
    const t = makeTest()
    const chatId = await seedChat(t)
    const ok = await t.mutation(internal.chatRuntime.consumeProxyCallBudget, { chatId })
    expect(ok).toBe(false)
  })
  test('200 calls succeed then 201st rejects', async () => {
    const t = makeTest()
    const chatId = await seedChat(t)
    await seedRuntime(t, chatId)
    for (let i = 0; i < 200; i += 1) {
      const ok = await t.mutation(internal.chatRuntime.consumeProxyCallBudget, { chatId })
      expect(ok).toBe(true)
    }
    const reject = await t.mutation(internal.chatRuntime.consumeProxyCallBudget, { chatId })
    expect(reject).toBe(false)
    const rt = await getRt(t, chatId)
    expect(rt?.proxyCallsThisTurn).toBe(200)
  })
})
describe('chatRuntime resetTurn / resetEventCount', () => {
  test('resetTurn zeroes proxyCallsThisTurn and streamEventCount', async () => {
    const t = makeTest()
    const chatId = await seedChat(t)
    await seedRuntime(t, chatId, { proxyCallsThisTurn: 50, streamEventCount: 3000 })
    await t.run(async ctx => {
      const { resetTurn } = await import('./chatRuntime')
      await resetTurn(ctx, chatId)
    })
    const rt = await getRt(t, chatId)
    expect(rt?.proxyCallsThisTurn).toBe(0)
    expect(rt?.streamEventCount).toBe(0)
  })
  test('resetTurn inserts row when missing', async () => {
    const t = makeTest()
    const chatId = await seedChat(t)
    await t.run(async ctx => {
      const { resetTurn } = await import('./chatRuntime')
      await resetTurn(ctx, chatId)
    })
    const rt = await getRt(t, chatId)
    expect(rt?.streamEventCount).toBe(0)
    expect(rt?.proxyCallsThisTurn).toBe(0)
  })
  test('resetEventCount preserves proxyCallsThisTurn', async () => {
    const t = makeTest()
    const chatId = await seedChat(t)
    await seedRuntime(t, chatId, { proxyCallsThisTurn: 42, streamEventCount: 100 })
    await t.run(async ctx => {
      const { resetEventCount } = await import('./chatRuntime')
      await resetEventCount(ctx, chatId)
    })
    const rt = await getRt(t, chatId)
    expect(rt?.streamEventCount).toBe(0)
    expect(rt?.proxyCallsThisTurn).toBe(42)
  })
  test('deleteRuntime removes the row', async () => {
    const t = makeTest()
    const chatId = await seedChat(t)
    await seedRuntime(t, chatId)
    await t.run(async ctx => {
      const { deleteRuntime } = await import('./chatRuntime')
      await deleteRuntime(ctx, chatId)
    })
    const rt = await getRt(t, chatId)
    expect(rt).toBeNull()
  })
  test('deleteRuntime no-ops when row missing', async () => {
    const t = makeTest()
    const chatId = await seedChat(t)
    await t.run(async ctx => {
      const { deleteRuntime } = await import('./chatRuntime')
      await deleteRuntime(ctx, chatId)
    })
    const rt = await getRt(t, chatId)
    expect(rt).toBeNull()
  })
})
describe('chatRuntime incrementEventCount', () => {
  test('throws when runtime row missing', async () => {
    const t = makeTest()
    const chatId = await seedChat(t)
    await expect(
      t.run(async ctx => {
        const { incrementEventCount } = await import('./chatRuntime')
        await incrementEventCount(ctx, chatId)
      })
    ).rejects.toThrow('chatRuntime missing')
  })
  test('throws "too many events" at 5000 cap', async () => {
    const t = makeTest()
    const chatId = await seedChat(t)
    await seedRuntime(t, chatId, { streamEventCount: 5000 })
    await expect(
      t.run(async ctx => {
        const { incrementEventCount } = await import('./chatRuntime')
        await incrementEventCount(ctx, chatId)
      })
    ).rejects.toThrow('too many events')
  })
  test('increments below cap', async () => {
    const t = makeTest()
    const chatId = await seedChat(t)
    await seedRuntime(t, chatId, { streamEventCount: 100 })
    const next = await t.run(async ctx => {
      const { incrementEventCount } = await import('./chatRuntime')
      return incrementEventCount(ctx, chatId)
    })
    expect(next).toBe(101)
  })
})
describe('chatRuntime getRuntime unique guard', () => {
  test('throws when duplicate runtime rows exist (data corruption guard)', async () => {
    const t = makeTest()
    const chatId = await seedChat(t)
    await t.run(async ctx => {
      await ctx.db.insert('chatRuntime', { chatId, streamEventCount: 0 })
      await ctx.db.insert('chatRuntime', { chatId, streamEventCount: 0 })
    })
    await expect(
      t.run(async ctx => {
        const { incrementEventCount } = await import('./chatRuntime')
        await incrementEventCount(ctx, chatId)
      })
    ).rejects.toThrow()
  })
})
