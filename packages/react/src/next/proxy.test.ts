import type { NextRequest } from 'next/server'
import { describe, expect, test } from 'bun:test'
import { proxy } from './proxy'
const makeReq = (url = 'https://example.com/'): NextRequest => {
  const init = new Request(url, { headers: { 'x-existing': 'preserved' } })
  return init as unknown as NextRequest
}
describe('CSP proxy', () => {
  test('sets Content-Security-Policy header', () => {
    const res = proxy(makeReq())
    const csp = res.headers.get('Content-Security-Policy')
    expect(csp).toBeTruthy()
    expect(csp).toContain("default-src 'self'")
  })
  test('script-src includes self + unsafe-inline (Next.js RSC hydration uses inline scripts)', () => {
    const csp = proxy(makeReq()).headers.get('Content-Security-Policy') ?? ''
    const scriptSrc = csp.split(';').find(s => s.trim().startsWith('script-src')) ?? ''
    expect(scriptSrc).toContain("'self'")
    expect(scriptSrc).toContain("'unsafe-inline'")
    expect(scriptSrc).not.toContain("'strict-dynamic'")
  })
  test('CSP includes Convex hosted origins', () => {
    const csp = proxy(makeReq()).headers.get('Content-Security-Policy') ?? ''
    expect(csp).toContain('https://*.convex.cloud')
    expect(csp).toContain('wss://*.convex.cloud')
    expect(csp).toContain('https://*.convex.site')
  })
  test('CSP enforces frame-ancestors none', () => {
    const csp = proxy(makeReq()).headers.get('Content-Security-Policy') ?? ''
    expect(csp).toContain("frame-ancestors 'none'")
  })
  test('CSP restricts base-uri to self', () => {
    const csp = proxy(makeReq()).headers.get('Content-Security-Policy') ?? ''
    expect(csp).toContain("base-uri 'self'")
  })
  test('form-action allows Google OAuth', () => {
    const csp = proxy(makeReq()).headers.get('Content-Security-Policy') ?? ''
    expect(csp).toContain('https://accounts.google.com')
  })
  test('connect-src allows Google APIs', () => {
    const csp = proxy(makeReq()).headers.get('Content-Security-Policy') ?? ''
    expect(csp).toContain('https://www.googleapis.com')
    expect(csp).toContain('https://oauth2.googleapis.com')
  })
  test('img-src allows Google avatar host', () => {
    const csp = proxy(makeReq()).headers.get('Content-Security-Policy') ?? ''
    expect(csp).toContain('https://lh3.googleusercontent.com')
  })
  test('CSP does NOT inject nonces (Next 16 RSC inline scripts not auto-nonced — known regression)', () => {
    const csp = proxy(makeReq()).headers.get('Content-Security-Policy') ?? ''
    expect(csp).not.toMatch(/'nonce-[A-Za-z0-9+/=]+'/u)
  })
  test('CSP source does not depend on per-request nonce generation', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(join(import.meta.dir, 'proxy.ts'), 'utf8')
    expect(src).not.toContain('crypto.randomUUID')
    expect(src).not.toContain('randomBytes')
    expect(src).not.toMatch(/nonce/u)
  })
  test('matcher source includes _next/static + _next/image + favicon exclusions', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(join(import.meta.dir, 'proxy.ts'), 'utf8')
    expect(src).toContain('_next/static|_next/image|favicon.ico')
  })
  test('matcher does NOT exclude api/ (auth callbacks need CSP)', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(join(import.meta.dir, 'proxy.ts'), 'utf8')
    const matcherIdx = src.indexOf('matcher:')
    const matcherSrc = src.slice(matcherIdx, matcherIdx + 500)
    expect(matcherSrc).not.toMatch(/\|api\//u)
  })
})
