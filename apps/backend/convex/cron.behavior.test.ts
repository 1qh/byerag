import { describe, expect, test } from 'bun:test'
import type { Id } from './_generated/dataModel'
import { makeTest } from '../test-utils/convex'
import { internal } from './_generated/api'

const STREAMING_TIMEOUT_MS = 10 * 60 * 1000
const SOFT_DELETE_GRACE_MS = 5 * 60_000
const SEQ_SERVER_ERROR = -1
const seedChat = async (
  t: ReturnType<typeof makeTest>,
  options: { deletedAt?: number; owner?: string; startedAtAgoMs?: number; streaming?: boolean } = {}
): Promise<Id<'chats'>> =>
  t.run(async ctx =>
    ctx.db.insert('chats', {
      deletedAt: options.deletedAt,
      messageCount: 0,
      owner: options.owner ?? 'cron@x',
      secretHash: 'h'.repeat(64),
      streaming: options.streaming ?? false,
      streamingStartedAt: Date.now() - (options.startedAtAgoMs ?? 0),
      title: 't',
      turns: 1,
      updatedAt: Date.now()
    })
  )
describe('timeoutStreaming', () => {
  test('no-op when chat is not streaming', async () => {
    const t = makeTest()
    const chatId = await seedChat(t, { streaming: false })
    await t.mutation(internal.messages.timeoutStreaming, { chatId })
    const after = await t.run(async ctx => ctx.db.get(chatId))
    expect(after?.streaming).toBe(false)
    const events = await t.run(async ctx =>
      ctx.db
        .query('streamEvents')
        .withIndex('by_chat', q => q.eq('chatId', chatId))
        .collect()
    )
    expect(events.length).toBe(0)
  })
  test('no-op when streaming but elapsed < STREAMING_TIMEOUT_MS', async () => {
    const t = makeTest()
    const chatId = await seedChat(t, { startedAtAgoMs: 60_000, streaming: true })
    await t.mutation(internal.messages.timeoutStreaming, { chatId })
    const after = await t.run(async ctx => ctx.db.get(chatId))
    expect(after?.streaming).toBe(true)
  })
  test('marks streaming=false and rotates secret when stuck past timeout', async () => {
    const t = makeTest()
    const chatId = await seedChat(t, { startedAtAgoMs: STREAMING_TIMEOUT_MS + 1000, streaming: true })
    const before = await t.run(async ctx => ctx.db.get(chatId))
    await t.mutation(internal.messages.timeoutStreaming, { chatId })
    const after = await t.run(async ctx => ctx.db.get(chatId))
    expect(after?.streaming).toBe(false)
    expect(after?.secretHash).not.toBe(before?.secretHash ?? '')
  })
  test('inserts SEQ_SERVER_ERROR streamEvent on timeout', async () => {
    const t = makeTest()
    const chatId = await seedChat(t, { startedAtAgoMs: STREAMING_TIMEOUT_MS + 1000, streaming: true })
    await t.mutation(internal.messages.timeoutStreaming, { chatId })
    const errs = await t.run(async ctx =>
      ctx.db
        .query('streamEvents')
        .withIndex('by_chat_seq', q => q.eq('chatId', chatId).eq('seq', SEQ_SERVER_ERROR))
        .collect()
    )
    expect(errs.length).toBe(1)
    expect(errs[0]?.content).toContain('agent timed out')
  })
  test('does not double-insert error if already present', async () => {
    const t = makeTest()
    const chatId = await seedChat(t, { startedAtAgoMs: STREAMING_TIMEOUT_MS + 1000, streaming: true })
    await t.run(async ctx => {
      await ctx.db.insert('streamEvents', { chatId, content: '{"prior":true}', seq: SEQ_SERVER_ERROR })
    })
    await t.mutation(internal.messages.timeoutStreaming, { chatId })
    const errs = await t.run(async ctx =>
      ctx.db
        .query('streamEvents')
        .withIndex('by_chat_seq', q => q.eq('chatId', chatId).eq('seq', SEQ_SERVER_ERROR))
        .collect()
    )
    expect(errs.length).toBe(1)
    expect(errs[0]?.content).toContain('prior')
  })
  test('clears sessionId on timeout', async () => {
    const t = makeTest()
    const chatId = await seedChat(t, { startedAtAgoMs: STREAMING_TIMEOUT_MS + 1000, streaming: true })
    await t.run(async ctx => {
      await ctx.db.patch(chatId, { sessionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' })
    })
    await t.mutation(internal.messages.timeoutStreaming, { chatId })
    const after = await t.run(async ctx => ctx.db.get(chatId))
    expect(after?.sessionId).toBeUndefined()
  })
})
describe('reconcileStreaming', () => {
  test('no-op when no stuck chats exist', async () => {
    const t = makeTest()
    await seedChat(t, { startedAtAgoMs: 30_000, streaming: true })
    await t.mutation(internal.chats.reconcileStreaming, {})
    const chat = await t.run(async ctx =>
      ctx.db
        .query('chats')
        .withIndex('by_streaming_startedAt', q => q.eq('streaming', true))
        .first()
    )
    expect(chat?.streaming).toBe(true)
  })
  test('marks stuck chats not-streaming', async () => {
    const t = makeTest()
    const chatId = await seedChat(t, { startedAtAgoMs: STREAMING_TIMEOUT_MS + 60_000, streaming: true })
    await t.mutation(internal.chats.reconcileStreaming, {})
    const after = await t.run(async ctx => ctx.db.get(chatId))
    expect(after?.streaming).toBe(false)
  })
  test('promotes truncation message into messages table for stuck chat', async () => {
    const t = makeTest()
    const chatId = await seedChat(t, { startedAtAgoMs: STREAMING_TIMEOUT_MS + 60_000, streaming: true })
    await t.mutation(internal.chats.reconcileStreaming, {})
    const msgs = await t.run(async ctx =>
      ctx.db
        .query('messages')
        .withIndex('by_chat', q => q.eq('chatId', chatId))
        .collect()
    )
    expect(msgs.some(m => m.type === 'error' && m.content.includes('reconciled'))).toBe(true)
  })
  test('rotates secret on reconciliation', async () => {
    const t = makeTest()
    const chatId = await seedChat(t, { startedAtAgoMs: STREAMING_TIMEOUT_MS + 60_000, streaming: true })
    const before = await t.run(async ctx => ctx.db.get(chatId))
    await t.mutation(internal.chats.reconcileStreaming, {})
    const after = await t.run(async ctx => ctx.db.get(chatId))
    expect(after?.secretHash).not.toBe(before?.secretHash ?? '')
  })
  test('clears sessionId on reconciliation', async () => {
    const t = makeTest()
    const chatId = await seedChat(t, { startedAtAgoMs: STREAMING_TIMEOUT_MS + 60_000, streaming: true })
    await t.run(async ctx => {
      await ctx.db.patch(chatId, { sessionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' })
    })
    await t.mutation(internal.chats.reconcileStreaming, {})
    const after = await t.run(async ctx => ctx.db.get(chatId))
    expect(after?.sessionId).toBeUndefined()
  })
  test('deletes prior streamEvents during reconciliation', async () => {
    const t = makeTest()
    const chatId = await seedChat(t, { startedAtAgoMs: STREAMING_TIMEOUT_MS + 60_000, streaming: true })
    await t.run(async ctx => {
      for (let i = 0; i < 5; i += 1) await ctx.db.insert('streamEvents', { chatId, content: `{"i":${i}}`, seq: i })
    })
    await t.mutation(internal.chats.reconcileStreaming, {})
    const events = await t.run(async ctx =>
      ctx.db
        .query('streamEvents')
        .withIndex('by_chat', q => q.eq('chatId', chatId))
        .collect()
    )
    expect(events.length).toBe(0)
  })
})
describe('hardPruneDeleted', () => {
  test('no-op when no deletedAt is set', async () => {
    const t = makeTest()
    await seedChat(t)
    await t.mutation(internal.chats.hardPruneDeleted, {})
    const chats = await t.run(async ctx => ctx.db.query('chats').collect())
    expect(chats.length).toBe(1)
  })
  test('does not delete chat within grace window', async () => {
    const t = makeTest()
    const chatId = await seedChat(t, { deletedAt: Date.now() - 60_000 })
    await t.mutation(internal.chats.hardPruneDeleted, {})
    const after = await t.run(async ctx => ctx.db.get(chatId))
    expect(after).not.toBeNull()
  })
  test('hard-deletes chat past grace window', async () => {
    const t = makeTest()
    const chatId = await seedChat(t, { deletedAt: Date.now() - SOFT_DELETE_GRACE_MS - 60_000 })
    await t.mutation(internal.chats.hardPruneDeleted, {})
    const after = await t.run(async ctx => ctx.db.get(chatId))
    expect(after).toBeNull()
  })
  test('also deletes messages and streamEvents children', async () => {
    const t = makeTest()
    const chatId = await seedChat(t, { deletedAt: Date.now() - SOFT_DELETE_GRACE_MS - 60_000 })
    await t.run(async ctx => {
      await ctx.db.insert('messages', { chatId, content: '{}', seq: 0, type: 'user' })
      await ctx.db.insert('streamEvents', { chatId, content: '{}', seq: 0 })
    })
    await t.mutation(internal.chats.hardPruneDeleted, {})
    const msgs = await t.run(async ctx =>
      ctx.db
        .query('messages')
        .withIndex('by_chat', q => q.eq('chatId', chatId))
        .collect()
    )
    const events = await t.run(async ctx =>
      ctx.db
        .query('streamEvents')
        .withIndex('by_chat', q => q.eq('chatId', chatId))
        .collect()
    )
    expect(msgs.length).toBe(0)
    expect(events.length).toBe(0)
  })
})
describe('pruneStaleSpend cron', () => {
  test('removes rows where dayKey < today AND inflight=0', async () => {
    const t = makeTest()
    await t.run(async ctx => {
      await ctx.db.insert('ownerSpend', { centsToday: 100, dayKey: '1999-01-01', owner: 'old@x' })
      await ctx.db.insert('ownerSpend', { centsToday: 50, dayKey: '1999-01-01', inflight: 0, owner: 'old2@x' })
    })
    await t.mutation(internal.ownerSpend.pruneStaleSpend, {})
    const remaining = await t.run(async ctx => ctx.db.query('ownerSpend').collect())
    expect(remaining.length).toBe(0)
  })
  test('preserves rows with inflight > 0 even when stale', async () => {
    const t = makeTest()
    await t.run(async ctx => {
      await ctx.db.insert('ownerSpend', { centsToday: 100, dayKey: '1999-01-01', inflight: 1, owner: 'leak@x' })
    })
    await t.mutation(internal.ownerSpend.pruneStaleSpend, {})
    const remaining = await t.run(async ctx => ctx.db.query('ownerSpend').collect())
    expect(remaining.length).toBe(1)
  })
})
describe('auditInvariants cron', () => {
  test('runs without error on empty table', async () => {
    const t = makeTest()
    await t.mutation(internal.ownerSpend.auditInvariants, {})
  })
  test('runs without error on healthy data', async () => {
    const t = makeTest()
    const r = await t.mutation(internal.ownerSpend.reserveBudget, { cents: 100, owner: 'audit@x' })
    await t.mutation(internal.ownerSpend.settleReservation, {
      actualCents: 50,
      owner: 'audit@x',
      reservedCents: 100,
      reservedDayKey: r.dayKey
    })
    await t.mutation(internal.ownerSpend.auditInvariants, {})
  })
})
