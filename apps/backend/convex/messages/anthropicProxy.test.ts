import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { makeTest } from '../../test-utils/convex'
import { clearStreaming, getSecret, send } from '../../test-utils/messages-helpers'
import { env } from '../env'

const originalFetch = globalThis.fetch
const stubFetch = (fn: typeof globalThis.fetch): void => {
  globalThis.fetch = fn
}
describe('anthropicProxy httpAction', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key-xyz'
  })
  afterEach(() => {
    globalThis.fetch = originalFetch
    delete process.env.ANTHROPIC_API_KEY
  })
  const proxyUrl = (path = '/v1/messages') => `/api/anthropic${path}`
  /** The proxy forwards to KIMI_BASE_URL — Claude Code reaches it by pointing ANTHROPIC_BASE_URL at us. */
  const upstreamUrl = (path: string) => new URL(path.replace(/^\//u, ''), env.KIMI_BASE_URL).toString()
  it('rejects malformed proxy token (oversized-body path also rejected before buffering)', async () => {
    const t = makeTest()
    const res = await t.fetch(proxyUrl(), {
      body: 'x',
      headers: { Authorization: 'Bearer proxy:abc:def', 'Content-Length': '5000000' },
      method: 'POST'
    })
    expect(res.status).toBe(401)
  })
  it('rejects malformed token with 401', async () => {
    const t = makeTest()
    const res = await t.fetch(proxyUrl(), {
      body: '{}',
      headers: { Authorization: 'Bearer not-a-proxy-token', 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(res.status).toBe(401)
  })
  it('rejects valid-format token but unknown chat with 401', async () => {
    const t = makeTest()
    const res = await t.fetch(proxyUrl(), {
      body: '{}',
      headers: {
        Authorization: 'Bearer proxy:nonexistent:00000000-0000-0000-0000-000000000000',
        'Content-Type': 'application/json'
      },
      method: 'POST'
    })
    expect(res.status).toBe(401)
  })
  it('rejects valid token but chat not streaming', async () => {
    const t = makeTest()
    const chatId = await send(t, 'proxy@test.com', 'x')
    const secret = await getSecret(t, chatId)
    await clearStreaming(t, chatId)
    const res = await t.fetch(proxyUrl(), {
      body: '{}',
      headers: {
        Authorization: `Bearer sk-ant-oat01-proxy_${chatId}_${secret.replaceAll('-', '')}`,
        'Content-Type': 'application/json'
      },
      method: 'POST'
    })
    expect(res.status).toBe(401)
  })
  it('forwards request and swaps auth header', async () => {
    const t = makeTest()
    const chatId = await send(t, 'proxyfwd@test.com', 'x')
    const secret = await getSecret(t, chatId)
    let captured: { headers?: Record<string, string>; url?: string } = {}
    stubFetch((async (url: string, init: { headers: Headers }) => {
      const headers: Record<string, string> = {}
      init.headers.forEach((v, k) => {
        headers[k.toLowerCase()] = v
      })
      captured = { headers, url }
      return new Response('{"ok":true}', { headers: { 'content-type': 'application/json' }, status: 200 })
    }) as typeof globalThis.fetch)
    const res = await t.fetch(proxyUrl('/v1/messages'), {
      body: '{"model":"claude-haiku-4-5"}',
      headers: {
        Authorization: `Bearer sk-ant-oat01-proxy_${chatId}_${secret.replaceAll('-', '')}`,
        'Content-Type': 'application/json'
      },
      method: 'POST'
    })
    expect(res.status).toBe(200)
    expect(captured.url).toBe(upstreamUrl('/v1/messages'))
    expect(captured.headers?.authorization).toBe(`Bearer ${env.KIMI_API_KEY}`)
    expect(captured.headers?.['x-api-key']).toBeUndefined()
    expect(captured.headers?.['anthropic-version']).toBe('2023-06-01')
  })
  it('rejects malformed anthropic-version with 400', async () => {
    const t = makeTest()
    const chatId = await send(t, 'proxyver@test.com', 'x')
    const secret = await getSecret(t, chatId)
    const res = await t.fetch(proxyUrl(), {
      body: '{}',
      headers: {
        Authorization: `Bearer sk-ant-oat01-proxy_${chatId}_${secret.replaceAll('-', '')}`,
        'Content-Type': 'application/json',
        'anthropic-version': 'not-a-date'
      },
      method: 'POST'
    })
    expect(res.status).toBe(400)
  })
  it('forwards path beyond /api/anthropic prefix (drops query params)', async () => {
    const t = makeTest()
    const chatId = await send(t, 'proxypath@test.com', 'x')
    const secret = await getSecret(t, chatId)
    let capturedUrl = ''
    stubFetch((async (url: string) => {
      capturedUrl = url
      return new Response('{}', { status: 200 })
    }) as typeof globalThis.fetch)
    await t.fetch(proxyUrl('/v1/messages?foo=bar'), {
      body: '{"model":"claude-haiku-4-5"}',
      headers: {
        Authorization: `Bearer sk-ant-oat01-proxy_${chatId}_${secret.replaceAll('-', '')}`,
        'Content-Type': 'application/json'
      },
      method: 'POST'
    })
    expect(capturedUrl).toBe(upstreamUrl('/v1/messages'))
  })
  it('returns upstream status code', async () => {
    const t = makeTest()
    const chatId = await send(t, 'proxyerr@test.com', 'x')
    const secret = await getSecret(t, chatId)
    stubFetch(async () => new Response('rate limit', { status: 429 }))
    const res = await t.fetch(proxyUrl(), {
      body: '{"model":"claude-haiku-4-5"}',
      headers: {
        Authorization: `Bearer sk-ant-oat01-proxy_${chatId}_${secret.replaceAll('-', '')}`,
        'Content-Type': 'application/json'
      },
      method: 'POST'
    })
    expect(res.status).toBe(429)
  })
})
