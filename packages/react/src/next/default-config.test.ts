import { describe, expect, test } from 'bun:test'
import { defaultNextConfig } from './default-config'

const getCsp = async (): Promise<string> => {
  const headersFn = defaultNextConfig.headers
  if (!headersFn) throw new Error('headers fn missing')
  const rules = await headersFn()
  const rule = rules[0]
  if (!rule) throw new Error('no header rule')
  const csp = rule.headers.find(h => h.key === 'Content-Security-Policy')?.value
  if (!csp) throw new Error('CSP header missing')
  return csp
}
describe('default-config security headers', () => {
  test('exposes Content-Security-Policy', async () => {
    const csp = await getCsp()
    expect(csp).toContain("default-src 'self'")
  })
  test('script-src includes self + unsafe-inline (Next.js RSC hydration uses inline scripts)', async () => {
    const csp = await getCsp()
    const scriptSrc = csp.split(';').find(s => s.trim().startsWith('script-src')) ?? ''
    expect(scriptSrc).toContain("'self'")
    expect(scriptSrc).toContain("'unsafe-inline'")
    expect(scriptSrc).not.toContain("'strict-dynamic'")
  })
  test('CSP includes Convex hosted origins', async () => {
    const csp = await getCsp()
    expect(csp).toContain('https://*.convex.cloud')
    expect(csp).toContain('wss://*.convex.cloud')
    expect(csp).toContain('https://*.convex.site')
  })
  test('CSP enforces frame-ancestors none', async () => {
    const csp = await getCsp()
    expect(csp).toContain("frame-ancestors 'none'")
  })
  test('CSP restricts base-uri to self', async () => {
    const csp = await getCsp()
    expect(csp).toContain("base-uri 'self'")
  })
  test('form-action allows Google OAuth', async () => {
    const csp = await getCsp()
    expect(csp).toContain('https://accounts.google.com')
  })
  test('connect-src allows Google APIs', async () => {
    const csp = await getCsp()
    expect(csp).toContain('https://www.googleapis.com')
    expect(csp).toContain('https://oauth2.googleapis.com')
  })
  test('img-src allows Google avatar host', async () => {
    const csp = await getCsp()
    expect(csp).toContain('https://lh3.googleusercontent.com')
  })
  test('CSP does NOT inject nonces (Next 16 RSC inline scripts not auto-nonced — known regression)', async () => {
    const csp = await getCsp()
    expect(csp).not.toMatch(/'nonce-[A-Za-z0-9+/=]+'/u)
  })
  test('header matcher excludes _next/static, _next/image, favicon', async () => {
    const rules = await defaultNextConfig.headers?.()
    const source = rules?.[0]?.source ?? ''
    expect(source).toContain('_next/static')
    expect(source).toContain('_next/image')
    expect(source).toContain('favicon.ico')
  })
})
