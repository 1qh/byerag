/* eslint-disable no-console */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { makeTest } from '../../test-utils/convex'
import { hashSecret } from '../secretHash'

const enc = new TextEncoder()
const realFetch = globalThis.fetch
const realApiKey = process.env.ANTHROPIC_API_KEY
const realLog = console.log
const realError = console.error
const SECRET = '22222222-2222-4222-8222-222222222222'
interface LogLine {
  [k: string]: unknown
  cause?: string
  event: string
  level: string
  ts: number
}
const captured: LogLine[] = []
const installLogCapture = (): void => {
  console.log = (line?: unknown) => {
    if (typeof line === 'string')
      try {
        const parsed = JSON.parse(line) as LogLine
        captured.push(parsed)
      } catch {
        /* Not JSON */
      }
  }
  console.error = (line?: unknown) => {
    if (typeof line === 'string')
      try {
        const parsed = JSON.parse(line) as LogLine
        captured.push(parsed)
      } catch {
        /* Not JSON */
      }
  }
}
const restoreLogCapture = (): void => {
  console.log = realLog
  console.error = realError
}
const seedChat = async (t: ReturnType<typeof makeTest>, owner: string): Promise<{ bearer: string; chatId: string }> => {
  const secretHash = await hashSecret(SECRET)
  const now = Date.now()
  const chatId: string = await t.run(async ctx => {
    const id = await ctx.db.insert('chats', {
      messageCount: 1,
      owner,
      secretHash,
      streaming: true,
      streamingStartedAt: now,
      title: 'logs',
      turns: 1,
      updatedAt: now
    })
    await ctx.db.insert('chatRuntime', { chatId: id, proxyCallsThisTurn: 0, streamEventCount: 0 })
    return id
  })
  return { bearer: `sk-ant-oat01-proxy_${chatId}_${SECRET.replaceAll('-', '')}`, chatId }
}
const sseFrame = (event: string, data: unknown): string => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
const sseStream = (frames: string[]): ReadableStream<Uint8Array> => {
  let i = 0
  return new ReadableStream<Uint8Array>({
    pull: controller => {
      if (i >= frames.length) controller.close()
      else {
        const frame = frames[i] ?? ''
        i += 1
        controller.enqueue(enc.encode(frame))
      }
    }
  })
}
const flushScheduler = async (t: ReturnType<typeof makeTest>): Promise<void> => {
  await new Promise<void>(r => {
    setTimeout(r, 30)
  })
  await t.finishAllScheduledFunctions(() => undefined)
  await new Promise<void>(r => {
    setTimeout(r, 30)
  })
}
const eventsByName = (name: string): LogLine[] => captured.filter(l => l.event === name)
describe('proxy log assertions', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
    captured.length = 0
    installLogCapture()
  })
  afterEach(() => {
    globalThis.fetch = realFetch
    if (realApiKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = realApiKey
    restoreLogCapture()
  })
  test('SSE happy path emits proxy.settle cause=sse-flush', async () => {
    const t = makeTest()
    const { bearer } = await seedChat(t, 'log-happy@x')
    globalThis.fetch = async () =>
      new Response(
        sseStream([
          sseFrame('message_start', {
            message: { model: 'claude-sonnet-4-6', usage: { input_tokens: 100, output_tokens: 1 } },
            type: 'message_start'
          }),
          sseFrame('message_delta', { type: 'message_delta', usage: { output_tokens: 200 } }),
          sseFrame('message_stop', { type: 'message_stop' })
        ]),
        { headers: { 'content-type': 'text/event-stream' }, status: 200 }
      )
    const res = await t.fetch('/api/anthropic/v1/messages', {
      body: JSON.stringify({ max_tokens: 256, messages: [{ content: 'hi', role: 'user' }], model: 'claude-sonnet-4-6' }),
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(res.status).toBe(200)
    await res.text()
    await flushScheduler(t)
    const settles = eventsByName('proxy.settle')
    expect(settles.length).toBe(1)
    expect(settles[0]?.cause).toBe('sse-flush')
    const reserves = eventsByName('spend.reserve')
    expect(reserves.length).toBe(1)
    const settled = eventsByName('spend.settle')
    expect(settled.length).toBe(1)
    expect(settled[0]?.kind).toBe('same-day')
  })
  test('non-SSE 500 emits proxy.refund cause=non-sse-error', async () => {
    const t = makeTest()
    const { bearer } = await seedChat(t, 'log-err@x')
    globalThis.fetch = async () =>
      new Response('upstream busted', { headers: { 'content-type': 'application/json' }, status: 502 })
    await t.fetch('/api/anthropic/v1/messages', {
      body: JSON.stringify({ max_tokens: 256, messages: [{ content: 'hi', role: 'user' }], model: 'claude-sonnet-4-6' }),
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      method: 'POST'
    })
    await flushScheduler(t)
    const refunds = eventsByName('proxy.refund')
    expect(refunds.length).toBe(1)
    expect(refunds[0]?.cause).toBe('non-sse-error')
  })
  test('non-SSE 200 with no usage emits proxy.settle cause=non-sse-no-usage', async () => {
    const t = makeTest()
    const { bearer } = await seedChat(t, 'log-no-usage@x')
    globalThis.fetch = async () =>
      new Response('not-json', { headers: { 'content-type': 'application/json' }, status: 200 })
    await t.fetch('/api/anthropic/v1/messages', {
      body: JSON.stringify({ max_tokens: 256, messages: [{ content: 'hi', role: 'user' }], model: 'claude-sonnet-4-6' }),
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      method: 'POST'
    })
    await flushScheduler(t)
    const settles = eventsByName('proxy.settle')
    expect(settles.length).toBe(1)
    expect(settles[0]?.cause).toBe('non-sse-no-usage')
  })
  test('non-SSE 200 with usage emits proxy.settle cause=non-sse-usage', async () => {
    const t = makeTest()
    const { bearer } = await seedChat(t, 'log-usage@x')
    globalThis.fetch = async () =>
      Response.json(
        { model: 'claude-sonnet-4-6', usage: { input_tokens: 1000, output_tokens: 500 } },
        {
          headers: { 'content-type': 'application/json' },
          status: 200
        }
      )
    await t.fetch('/api/anthropic/v1/messages', {
      body: JSON.stringify({ max_tokens: 256, messages: [{ content: 'hi', role: 'user' }], model: 'claude-sonnet-4-6' }),
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      method: 'POST'
    })
    await flushScheduler(t)
    const settles = eventsByName('proxy.settle')
    expect(settles.length).toBe(1)
    expect(settles[0]?.cause).toBe('non-sse-usage')
  })
  test('inflight-rejected reserve emits spend.reserve.rejected reason=inflight', async () => {
    const t = makeTest()
    const owner = 'log-inflight@x'
    const { internal: api } = await import('../_generated/api')
    for (let i = 0; i < 8; i += 1) await t.mutation(api.ownerSpend.reserveBudget, { cents: 100, owner })
    captured.length = 0
    const r = await t.mutation(api.ownerSpend.reserveBudget, { cents: 100, owner })
    expect(r.ok).toBe(false)
    const rejected = eventsByName('spend.reserve.rejected')
    expect(rejected.length).toBe(1)
    expect(rejected[0]?.reason).toBe('inflight')
  })
  test('cap-rejected reserve emits spend.reserve.rejected reason=cap', async () => {
    const t = makeTest()
    const owner = 'log-cap@x'
    const { internal: api } = await import('../_generated/api')
    const r = await t.mutation(api.ownerSpend.reserveBudget, { cents: 2400, owner })
    await t.mutation(api.ownerSpend.settleReservation, {
      actualCents: 2400,
      owner,
      reservedCents: 2400,
      reservedDayKey: r.dayKey
    })
    captured.length = 0
    const r2 = await t.mutation(api.ownerSpend.reserveBudget, { cents: 200, owner })
    expect(r2.ok).toBe(false)
    const rejected = eventsByName('spend.reserve.rejected')
    expect(rejected.length).toBe(1)
    expect(rejected[0]?.reason).toBe('cap')
  })
  test('cap overshoot triggers spend.cap.overshoot error log', async () => {
    const t = makeTest()
    const owner = 'log-overshoot@x'
    const { internal: api } = await import('../_generated/api')
    const r = await t.mutation(api.ownerSpend.reserveBudget, { cents: 2500, owner })
    captured.length = 0
    await t.mutation(api.ownerSpend.settleReservation, {
      actualCents: 5000,
      owner,
      reservedCents: 2500,
      reservedDayKey: r.dayKey
    })
    const overshoot = eventsByName('spend.cap.overshoot')
    expect(overshoot.length).toBeGreaterThan(0)
  })
  test('audit emits summary on healthy snapshot', async () => {
    const t = makeTest()
    const owner = 'log-audit@x'
    const { internal: api } = await import('../_generated/api')
    const r = await t.mutation(api.ownerSpend.reserveBudget, { cents: 100, owner })
    await t.mutation(api.ownerSpend.settleReservation, {
      actualCents: 50,
      owner,
      reservedCents: 100,
      reservedDayKey: r.dayKey
    })
    captured.length = 0
    await t.mutation(api.ownerSpend.auditInvariants, {})
    const summary = eventsByName('audit.summary')
    expect(summary.length).toBe(1)
    expect(summary[0]?.overshootCents).toBe(0)
    expect(summary[0]?.overshootInflight).toBe(0)
    expect(summary[0]?.stuckInflight).toBe(0)
  })
  test('every reserve+settle pair logs spend.reserve and spend.settle', async () => {
    const t = makeTest()
    const owner = 'log-pair@x'
    const { internal: api } = await import('../_generated/api')
    const r = await t.mutation(api.ownerSpend.reserveBudget, { cents: 100, owner })
    await t.mutation(api.ownerSpend.settleReservation, {
      actualCents: 50,
      owner,
      reservedCents: 100,
      reservedDayKey: r.dayKey
    })
    expect(eventsByName('spend.reserve').length).toBe(1)
    expect(eventsByName('spend.settle').length).toBe(1)
  })
})
