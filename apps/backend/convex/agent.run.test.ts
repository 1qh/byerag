import { describe, expect, test } from 'bun:test'
import type { Id } from './_generated/dataModel'
import { makeTest } from '../test-utils/convex'
import { internal } from './_generated/api'
import { hashSecret } from './secretHash'

const SECRET = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
const seedChatWithUser = async (
  t: ReturnType<typeof makeTest>,
  options: { invalidUserMsg?: boolean; missingUserMsg?: boolean; owner?: string } = {}
): Promise<{ chatId: Id<'chats'>; secret: string }> => {
  const secretHash = await hashSecret(SECRET)
  const owner = options.owner ?? 'agentrun@x'
  const chatId = await t.run(async ctx => {
    const id = await ctx.db.insert('chats', {
      messageCount: 1,
      owner,
      secretHash,
      streaming: true,
      streamingStartedAt: Date.now(),
      title: 't',
      turns: 1,
      updatedAt: Date.now()
    })
    if (!options.missingUserMsg)
      await ctx.db.insert('messages', {
        chatId: id,
        content: options.invalidUserMsg
          ? '{not json'
          : JSON.stringify({
              message: { content: [{ text: 'hello agent', type: 'text' }], role: 'user' },
              type: 'user'
            }),
        seq: 0,
        type: 'user'
      })
    await ctx.db.insert('chatRuntime', { chatId: id, proxyCallsThisTurn: 0, streamEventCount: 0 })
    return id
  })
  return { chatId, secret: SECRET }
}
const errorMessages = async (t: ReturnType<typeof makeTest>, chatId: Id<'chats'>): Promise<string[]> =>
  t.run(async ctx => {
    const events = await ctx.db
      .query('streamEvents')
      .withIndex('by_chat', q => q.eq('chatId', chatId))
      .collect()
    return events.map(e => e.content)
  })
describe('agent.run gate branches', () => {
  test('no last user message: action records error', async () => {
    const t = makeTest()
    const { chatId, secret } = await seedChatWithUser(t, { missingUserMsg: true })
    await t.action(internal.agent.run, { chatId, email: 'agentrun@x', secret }).catch(() => undefined)
    const errs = await errorMessages(t, chatId)
    expect(errs.some(e => e.includes('no user message') || e.includes('malformed'))).toBe(true)
  })
  test('malformed user message JSON: action records error', async () => {
    const t = makeTest()
    const { chatId, secret } = await seedChatWithUser(t, { invalidUserMsg: true })
    await t.action(internal.agent.run, { chatId, email: 'agentrun@x', secret }).catch(() => undefined)
    const errs = await errorMessages(t, chatId)
    expect(errs.length).toBeGreaterThan(0)
  })
})
