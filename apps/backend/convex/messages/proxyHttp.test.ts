import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { makeTest } from '../../test-utils/convex'
import { hashSecret } from '../secretHash'

const enc = new TextEncoder()
const realFetch = globalThis.fetch
const realApiKey = process.env.ANTHROPIC_API_KEY
const SECRET = '11111111-1111-4111-8111-111111111111'
const setApiKey = (): void => {
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key'
}
const restoreEnv = (): void => {
  if (realApiKey === undefined) delete process.env.ANTHROPIC_API_KEY
  else process.env.ANTHROPIC_API_KEY = realApiKey
}
const setFetch = (impl: typeof globalThis.fetch): void => {
  globalThis.fetch = impl
}
const restoreFetch = (): void => {
  globalThis.fetch = realFetch
}
const seedChat = async (
  t: ReturnType<typeof makeTest>,
  owner: string,
  options: { streaming?: boolean } = {}
): Promise<{ bearer: string; chatId: string }> => {
  const secretHash = await hashSecret(SECRET)
  const now = Date.now()
  const chatId: string = await t.run(async ctx => {
    const id = await ctx.db.insert('chats', {
      messageCount: 1,
      owner,
      secretHash,
      streaming: options.streaming ?? true,
      streamingStartedAt: now,
      title: 'test',
      turns: 1,
      updatedAt: now
    })
    await ctx.db.insert('chatRuntime', { chatId: id, proxyCallsThisTurn: 0, streamEventCount: 0 })
    return id
  })
  return { bearer: `sk-ant-oat01-proxy_${chatId}_${SECRET.replaceAll('-', '')}`, chatId }
}
const sseFrame = (event: string, data: unknown): string => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
const sseStream = (frames: string[], opts: { delayMs?: number; errorAt?: number } = {}): ReadableStream<Uint8Array> => {
  let i = 0
  return new ReadableStream<Uint8Array>({
    pull: async controller => {
      if (opts.delayMs)
        await new Promise<void>(r => {
          setTimeout(r, opts.delayMs)
        })
      if (opts.errorAt !== undefined && i >= opts.errorAt) {
        controller.error(new Error('upstream network blew up'))
        return
      }
      if (i >= frames.length) {
        controller.close()
        return
      }
      const frame = frames[i] ?? ''
      i += 1
      controller.enqueue(enc.encode(frame))
    }
  })
}
const ownerSpendRows = async (
  t: ReturnType<typeof makeTest>,
  owner: string
): Promise<{ centsToday: number; dayKey: string; inflight: number }[]> =>
  t.run(async ctx => {
    const rows = await ctx.db
      .query('ownerSpend')
      .withIndex('by_owner', q => q.eq('owner', owner))
      .collect()
    return rows.map(r => ({ centsToday: r.centsToday, dayKey: r.dayKey, inflight: r.inflight ?? 0 }))
  })
describe('anthropicProxy http integration', () => {
  beforeEach(() => {
    setApiKey()
  })
  afterEach(async () => {
    restoreFetch()
    restoreEnv()
  })
  test('SSE happy path: settles with usage; inflight returns to 0', async () => {
    const t = makeTest()
    const owner = 'happy@x'
    const { bearer } = await seedChat(t, owner)
    setFetch(async () => {
      const body = sseStream([
        sseFrame('message_start', {
          message: { model: 'claude-sonnet-4-6', usage: { input_tokens: 1000, output_tokens: 1 } },
          type: 'message_start'
        }),
        sseFrame('message_delta', { type: 'message_delta', usage: { output_tokens: 500 } }),
        sseFrame('message_stop', { type: 'message_stop' })
      ])
      return new Response(body, { headers: { 'content-type': 'text/event-stream' }, status: 200 })
    })
    const res = await t.fetch('/api/anthropic/v1/messages', {
      body: JSON.stringify({ max_tokens: 1024, messages: [{ content: 'hi', role: 'user' }], model: 'claude-sonnet-4-6' }),
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('message_start')
    expect(text).toContain('message_stop')
    await new Promise<void>(r => {
      setTimeout(r, 30)
    })
    await t.finishAllScheduledFunctions(() => undefined)
    await new Promise<void>(r => {
      setTimeout(r, 30)
    })
    const rows = await ownerSpendRows(t, owner)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.inflight).toBe(0)
    expect(rows[0]?.centsToday).toBeGreaterThanOrEqual(0)
    expect(rows[0]?.centsToday).toBeLessThan(50)
  })
  test('SSE upstream 200 with NO usage frames refunds reservation', async () => {
    const t = makeTest()
    const owner = 'no-usage@x'
    const { bearer } = await seedChat(t, owner)
    setFetch(
      async () =>
        new Response(sseStream([sseFrame('error', { error: 'something went wrong' })]), {
          headers: { 'content-type': 'text/event-stream' },
          status: 200
        })
    )
    const res = await t.fetch('/api/anthropic/v1/messages', {
      body: JSON.stringify({ max_tokens: 1024, messages: [{ content: 'hi', role: 'user' }], model: 'claude-sonnet-4-6' }),
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(res.status).toBe(200)
    await res.text()
    await new Promise<void>(r => {
      setTimeout(r, 30)
    })
    await t.finishAllScheduledFunctions(() => undefined)
    await new Promise<void>(r => {
      setTimeout(r, 30)
    })
    const rows = await ownerSpendRows(t, owner)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.inflight).toBe(0)
    expect(rows[0]?.centsToday).toBe(0)
  })
  test('non-SSE 200 with usage settles actual', async () => {
    const t = makeTest()
    const owner = 'non-sse-ok@x'
    const { bearer } = await seedChat(t, owner)
    setFetch(async () =>
      Response.json(
        {
          model: 'claude-sonnet-4-6',
          usage: { input_tokens: 5000, output_tokens: 2000 }
        },
        { headers: { 'content-type': 'application/json' }, status: 200 }
      )
    )
    const res = await t.fetch('/api/anthropic/v1/messages', {
      body: JSON.stringify({ max_tokens: 1024, messages: [{ content: 'hi', role: 'user' }], model: 'claude-sonnet-4-6' }),
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(res.status).toBe(200)
    await res.text()
    await new Promise<void>(r => {
      setTimeout(r, 30)
    })
    await t.finishAllScheduledFunctions(() => undefined)
    await new Promise<void>(r => {
      setTimeout(r, 30)
    })
    const rows = await ownerSpendRows(t, owner)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.inflight).toBe(0)
    expect(rows[0]?.centsToday).toBeGreaterThan(0)
    expect(rows[0]?.centsToday).toBeLessThan(50)
  })
  test('non-SSE 5xx error refunds reservation', async () => {
    const t = makeTest()
    const owner = 'non-sse-err@x'
    const { bearer } = await seedChat(t, owner)
    setFetch(async () =>
      Response.json(
        { error: 'upstream busted' },
        {
          headers: { 'content-type': 'application/json' },
          status: 502
        }
      )
    )
    const res = await t.fetch('/api/anthropic/v1/messages', {
      body: JSON.stringify({ max_tokens: 1024, messages: [{ content: 'hi', role: 'user' }], model: 'claude-sonnet-4-6' }),
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(res.status).toBe(502)
    await res.text()
    await new Promise<void>(r => {
      setTimeout(r, 30)
    })
    await t.finishAllScheduledFunctions(() => undefined)
    await new Promise<void>(r => {
      setTimeout(r, 30)
    })
    const rows = await ownerSpendRows(t, owner)
    expect(rows[0]?.inflight).toBe(0)
    expect(rows[0]?.centsToday).toBe(0)
  })
  test('non-SSE 200 with no parseable usage settles full reservedCents (operator paid)', async () => {
    const t = makeTest()
    const owner = 'non-sse-nousage@x'
    const { bearer } = await seedChat(t, owner)
    setFetch(
      async () => new Response('not-json-but-200', { headers: { 'content-type': 'application/json' }, status: 200 })
    )
    const res = await t.fetch('/api/anthropic/v1/messages', {
      body: JSON.stringify({ max_tokens: 1024, messages: [{ content: 'hi', role: 'user' }], model: 'claude-sonnet-4-6' }),
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(res.status).toBe(200)
    await res.text()
    await new Promise<void>(r => {
      setTimeout(r, 30)
    })
    await t.finishAllScheduledFunctions(() => undefined)
    await new Promise<void>(r => {
      setTimeout(r, 30)
    })
    const rows = await ownerSpendRows(t, owner)
    expect(rows[0]?.inflight).toBe(0)
    expect(rows[0]?.centsToday).toBeGreaterThan(0)
  })
  test('count_tokens skips reservation entirely', async () => {
    const t = makeTest()
    const owner = 'count@x'
    const { bearer } = await seedChat(t, owner)
    setFetch(async () =>
      Response.json(
        { input_tokens: 12_345 },
        {
          headers: { 'content-type': 'application/json' },
          status: 200
        }
      )
    )
    const res = await t.fetch('/api/anthropic/v1/messages/count_tokens', {
      body: JSON.stringify({ messages: [{ content: 'hi', role: 'user' }], model: 'claude-sonnet-4-6' }),
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(res.status).toBe(200)
    await res.text()
    await new Promise<void>(r => {
      setTimeout(r, 30)
    })
    await t.finishAllScheduledFunctions(() => undefined)
    await new Promise<void>(r => {
      setTimeout(r, 30)
    })
    const rows = await ownerSpendRows(t, owner)
    expect(rows).toHaveLength(0)
  })
  test('inflight cap rejects 9th concurrent proxy call', async () => {
    const t = makeTest()
    const owner = 'cap@x'
    const { internal: api } = await import('../_generated/api')
    for (let i = 0; i < 8; i += 1) await t.mutation(api.ownerSpend.reserveBudget, { cents: 100, owner })
    const { bearer } = await seedChat(t, owner)
    setFetch(async () =>
      Response.json(
        { usage: { input_tokens: 10, output_tokens: 5 } },
        {
          headers: { 'content-type': 'application/json' },
          status: 200
        }
      )
    )
    const res = await t.fetch('/api/anthropic/v1/messages', {
      body: JSON.stringify({ max_tokens: 1024, messages: [{ content: 'hi', role: 'user' }], model: 'claude-sonnet-4-6' }),
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(res.status).toBe(402)
  })
  test('cap exceeded rejects with 402', async () => {
    const t = makeTest()
    const owner = 'cap-cents@x'
    const { internal: api } = await import('../_generated/api')
    const r = await t.mutation(api.ownerSpend.reserveBudget, { cents: 2400, owner })
    await t.mutation(api.ownerSpend.settleReservation, {
      actualCents: 2400,
      owner,
      reservedCents: 2400,
      reservedDayKey: r.dayKey
    })
    const { bearer } = await seedChat(t, owner)
    setFetch(async () =>
      Response.json(
        { usage: { input_tokens: 10, output_tokens: 5 } },
        {
          headers: { 'content-type': 'application/json' },
          status: 200
        }
      )
    )
    const res = await t.fetch('/api/anthropic/v1/messages', {
      body: JSON.stringify({
        max_tokens: 100_000,
        messages: [{ content: 'hi', role: 'user' }],
        model: 'claude-sonnet-4-6'
      }),
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(res.status).toBe(402)
  })
  test('invalid bearer returns 401, no reservation made', async () => {
    const t = makeTest()
    const owner = 'invalid@x'
    await seedChat(t, owner)
    const res = await t.fetch('/api/anthropic/v1/messages', {
      body: JSON.stringify({ messages: [{ content: 'hi', role: 'user' }], model: 'claude-sonnet-4-6' }),
      headers: { Authorization: 'Bearer proxy:bogus:nope', 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(res.status).toBe(401)
    const rows = await ownerSpendRows(t, owner)
    expect(rows).toHaveLength(0)
  })
  test('rejects non-streaming chat with 401', async () => {
    const t = makeTest()
    const owner = 'not-streaming@x'
    const { bearer } = await seedChat(t, owner, { streaming: false })
    const res = await t.fetch('/api/anthropic/v1/messages', {
      body: JSON.stringify({ messages: [{ content: 'hi', role: 'user' }], model: 'claude-sonnet-4-6' }),
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(res.status).toBe(401)
  })
  test('disallowed path returns 403', async () => {
    const t = makeTest()
    const owner = 'badpath@x'
    const { bearer } = await seedChat(t, owner)
    const res = await t.fetch('/api/anthropic/v1/admin/keys', {
      body: '{}',
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(res.status).toBe(403)
  })
  test('non-json content-type returns 400', async () => {
    const t = makeTest()
    const owner = 'badct@x'
    const { bearer } = await seedChat(t, owner)
    const res = await t.fetch('/api/anthropic/v1/messages', {
      body: 'hi',
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'text/plain' },
      method: 'POST'
    })
    expect(res.status).toBe(400)
  })
})
