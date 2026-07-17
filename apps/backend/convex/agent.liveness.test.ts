import { describe, expect, test } from 'bun:test'
import type { Id } from './_generated/dataModel'
import { makeTest } from '../test-utils/convex'
import { internal } from './_generated/api'
import { hashSecret } from './secretHash'

const SECRET = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const seedChat = async (
  t: ReturnType<typeof makeTest>,
  options: { secret?: string; streaming?: boolean } = {}
): Promise<{ chatId: Id<'chats'>; secret: string }> => {
  const secret = options.secret ?? SECRET
  const secretHash = await hashSecret(secret)
  const chatId = await t.run(async ctx =>
    ctx.db.insert('chats', {
      app: 'user',
      messageCount: 0,
      owner: 'live@x',
      secretHash,
      streaming: options.streaming ?? true,
      streamingStartedAt: Date.now(),
      title: 't',
      turns: 1,
      updatedAt: Date.now()
    })
  )
  return { chatId, secret }
}
const errorEventCount = async (t: ReturnType<typeof makeTest>, chatId: Id<'chats'>): Promise<number> =>
  t.run(async ctx => {
    const rows = await ctx.db
      .query('streamEvents')
      .withIndex('by_chat', q => q.eq('chatId', chatId))
      .collect()
    return rows.filter(r => r.content.includes('agent silent') || r.content.includes('error')).length
  })
describe('streamEventsForLiveness', () => {
  test('returns empty when no events', async () => {
    const t = makeTest()
    const { chatId } = await seedChat(t)
    const events = await t.query(internal.messages.streamEventsForLiveness, { chatId })
    expect(events).toHaveLength(0)
  })
  test('returns positive-seq event when present', async () => {
    const t = makeTest()
    const { chatId } = await seedChat(t)
    await t.run(async ctx => {
      await ctx.db.insert('streamEvents', { chatId, content: '{}', seq: 5 })
    })
    const events = await t.query(internal.messages.streamEventsForLiveness, { chatId })
    expect(events).toHaveLength(1)
    expect(events[0]?.seq).toBe(5)
  })
  test('falls back to negative-seq agent events when no positive seqs', async () => {
    const t = makeTest()
    const { chatId } = await seedChat(t)
    await t.run(async ctx => {
      await ctx.db.insert('streamEvents', { chatId, content: '{}', seq: -999 })
    })
    const events = await t.query(internal.messages.streamEventsForLiveness, { chatId })
    expect(events).toHaveLength(1)
    expect(events[0]?.seq).toBe(-999)
  })
  test('prefers positive seq over negative when both exist', async () => {
    const t = makeTest()
    const { chatId } = await seedChat(t)
    await t.run(async ctx => {
      await ctx.db.insert('streamEvents', { chatId, content: '{}', seq: -500 })
      await ctx.db.insert('streamEvents', { chatId, content: '{}', seq: 3 })
    })
    const events = await t.query(internal.messages.streamEventsForLiveness, { chatId })
    expect(events[0]?.seq).toBe(3)
  })
})
describe('insertError mutation behavior (used by livenessCheck)', () => {
  test('inserts error event with rotated secret and streaming=false', async () => {
    const t = makeTest()
    const { chatId } = await seedChat(t)
    await t.mutation(internal.messages.insertError, { chatId, error: 'agent silent test' })
    const after = await t.run(async ctx => ctx.db.get(chatId))
    expect(after?.streaming).toBe(false)
    const events = await t.run(async ctx =>
      ctx.db
        .query('streamEvents')
        .withIndex('by_chat', q => q.eq('chatId', chatId))
        .collect()
    )
    expect(events.some(e => e.content.includes('agent silent test'))).toBe(true)
  })
  test('handles non-streaming chat (no-op visible state still consistent)', async () => {
    const t = makeTest()
    const { chatId } = await seedChat(t, { streaming: false })
    await t.mutation(internal.messages.insertError, { chatId, error: 'late' })
    const after = await t.run(async ctx => ctx.db.get(chatId))
    expect(after?.streaming).toBe(false)
  })
})
describe('agent.livenessCheck integration', () => {
  test('no-op when chat is not streaming', async () => {
    const t = makeTest()
    const { chatId, secret } = await seedChat(t, { streaming: false })
    await t.action(internal.agent.livenessCheck, { chatId, secret })
    expect(await errorEventCount(t, chatId)).toBe(0)
  })
  test('no-op when secret hash mismatches (rotated since scheduling)', async () => {
    const t = makeTest()
    const { chatId } = await seedChat(t)
    await t.action(internal.agent.livenessCheck, { chatId, secret: 'ffffffff-ffff-4fff-8fff-ffffffffffff' })
    expect(await errorEventCount(t, chatId)).toBe(0)
    const after = await t.run(async ctx => ctx.db.get(chatId))
    expect(after?.streaming).toBe(true)
  })
  test('no-op when events exist (agent has emitted)', async () => {
    const t = makeTest()
    const { chatId, secret } = await seedChat(t)
    await t.run(async ctx => {
      await ctx.db.insert('streamEvents', { chatId, content: '{}', seq: 0 })
    })
    await t.action(internal.agent.livenessCheck, { chatId, secret })
    expect(await errorEventCount(t, chatId)).toBe(0)
    const after = await t.run(async ctx => ctx.db.get(chatId))
    expect(after?.streaming).toBe(true)
  })
  test('inserts agent-silent error when streaming with no events', async () => {
    const t = makeTest()
    const { chatId, secret } = await seedChat(t)
    await t.action(internal.agent.livenessCheck, { chatId, secret })
    const events = await t.run(async ctx =>
      ctx.db
        .query('streamEvents')
        .withIndex('by_chat', q => q.eq('chatId', chatId))
        .collect()
    )
    expect(events.some(e => e.content.includes('agent silent'))).toBe(true)
    const after = await t.run(async ctx => ctx.db.get(chatId))
    expect(after?.streaming).toBe(false)
  })
})
