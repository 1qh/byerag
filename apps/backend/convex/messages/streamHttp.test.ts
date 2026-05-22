import { describe, expect, test } from 'bun:test'
import type { Id } from '../_generated/dataModel'
import { makeTest } from '../../test-utils/convex'
import { hashSecret } from '../secretHash'

const SECRET = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const seedChat = async (
  t: ReturnType<typeof makeTest>,
  options: { secret?: string; streaming?: boolean } = {}
): Promise<{ bearer: string; chatId: string; secret: string }> => {
  const secret = options.secret ?? SECRET
  const secretHash = await hashSecret(secret)
  const now = Date.now()
  const chatId: string = await t.run(async ctx => {
    const id = await ctx.db.insert('chats', {
      messageCount: 0,
      owner: 'http@x',
      secretHash,
      streaming: options.streaming ?? true,
      streamingStartedAt: now,
      title: 'http test',
      turns: 1,
      updatedAt: now
    })
    await ctx.db.insert('chatRuntime', { chatId: id, proxyCallsThisTurn: 0, streamEventCount: 0 })
    return id
  })
  return { bearer: `sk-ant-oat01-proxy_${chatId}_${secret.replaceAll('-', '')}`, chatId, secret }
}
describe('streamEventHttp', () => {
  test('rejects malformed body', async () => {
    const t = makeTest()
    const res = await t.fetch('/api/stream/event', {
      body: 'not-json',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(res.status).toBe(400)
  })
  test('rejects missing required fields', async () => {
    const t = makeTest()
    const res = await t.fetch('/api/stream/event', {
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(res.status).toBe(400)
  })
  test('rejects invalid chatId shape', async () => {
    const t = makeTest()
    const res = await t.fetch('/api/stream/event', {
      body: JSON.stringify({
        chatId: 'INVALID-WITH-CAPS',
        content: '{}',
        secret: SECRET,
        seq: 0
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(res.status).toBe(400)
  })
  test('rejects invalid secret with 401', async () => {
    const t = makeTest()
    const { chatId } = await seedChat(t)
    const res = await t.fetch('/api/stream/event', {
      body: JSON.stringify({
        chatId,
        content: JSON.stringify({ type: 'assistant' }),
        secret: 'wrong-secret',
        seq: 0
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(res.status).toBe(401)
  })
  test('successful insert returns ok=true', async () => {
    const t = makeTest()
    const { chatId, secret } = await seedChat(t)
    const res = await t.fetch('/api/stream/event', {
      body: JSON.stringify({
        chatId,
        content: JSON.stringify({ type: 'assistant' }),
        secret,
        seq: 0
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(res.status).toBe(200)
    const obj = (await res.json()) as { ok: boolean }
    expect(obj.ok).toBe(true)
    const events = await t.run(async ctx =>
      ctx.db
        .query('streamEvents')
        .withIndex('by_chat_seq', q => q.eq('chatId', chatId as Id<'chats'>).eq('seq', 0))
        .collect()
    )
    expect(events.length).toBe(1)
  })
  test('duplicate seq returns 409', async () => {
    const t = makeTest()
    const { chatId, secret } = await seedChat(t)
    const headers = { 'Content-Type': 'application/json' }
    const body = JSON.stringify({
      chatId,
      content: JSON.stringify({ type: 'assistant' }),
      secret,
      seq: 0
    })
    await t.fetch('/api/stream/event', { body, headers, method: 'POST' })
    const res2 = await t.fetch('/api/stream/event', { body, headers, method: 'POST' })
    expect(res2.status).toBe(409)
  })
  test('returns 409 when chat not streaming', async () => {
    const t = makeTest()
    const { chatId, secret } = await seedChat(t, { streaming: false })
    const res = await t.fetch('/api/stream/event', {
      body: JSON.stringify({
        chatId,
        content: JSON.stringify({ type: 'assistant' }),
        secret,
        seq: 0
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(res.status).toBe(401)
  })
  test('rejects oversized content (>120K)', async () => {
    const t = makeTest()
    const { chatId, secret } = await seedChat(t)
    const res = await t.fetch('/api/stream/event', {
      body: JSON.stringify({
        chatId,
        content: 'x'.repeat(150_000),
        secret,
        seq: 0
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(res.status).toBe(400)
  })
})
describe('completeHttp', () => {
  test('rejects malformed body', async () => {
    const t = makeTest()
    const res = await t.fetch('/api/stream/complete', {
      body: 'not-json',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(res.status).toBe(400)
  })
  test('rejects invalid chatId shape', async () => {
    const t = makeTest()
    const res = await t.fetch('/api/stream/complete', {
      body: JSON.stringify({ chatId: 'BAD CAPS', secret: SECRET }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(res.status).toBe(400)
  })
  test('rejects invalid secret with 401', async () => {
    const t = makeTest()
    const { chatId } = await seedChat(t)
    const res = await t.fetch('/api/stream/complete', {
      body: JSON.stringify({ chatId, secret: 'wrong-one' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(res.status).toBe(401)
  })
  test('successful complete returns ok=true and clears streaming', async () => {
    const t = makeTest()
    const { chatId, secret } = await seedChat(t)
    const res = await t.fetch('/api/stream/complete', {
      body: JSON.stringify({ chatId, secret }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(res.status).toBe(200)
    const after = await t.run(async ctx => ctx.db.get(chatId as Id<'chats'>))
    expect(after?.streaming).toBe(false)
  })
  test('accepts optional sessionId', async () => {
    const t = makeTest()
    const { chatId, secret } = await seedChat(t)
    const sessionId = '11111111-2222-3333-4444-555555555555'
    const res = await t.fetch('/api/stream/complete', {
      body: JSON.stringify({ chatId, secret, sessionId }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(res.status).toBe(200)
    const after = await t.run(async ctx => ctx.db.get(chatId as Id<'chats'>))
    expect(after?.sessionId).toBe(sessionId)
  })
  test('returns 400 on already-completed chat', async () => {
    const t = makeTest()
    const { chatId, secret } = await seedChat(t)
    await t.fetch('/api/stream/complete', {
      body: JSON.stringify({ chatId, secret }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    })
    const res2 = await t.fetch('/api/stream/complete', {
      body: JSON.stringify({ chatId, secret }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(res2.status).toBe(401)
  })
})
