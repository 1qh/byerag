/** biome-ignore-all lint/suspicious/noUndeclaredEnvVars: probe env override */
/* oxlint-disable unicorn/no-process-exit, unicorn/consistent-function-scoping */
/** biome-ignore-all lint/style/noProcessEnv: probe env override */
/** biome-ignore-all lint/performance/useTopLevelRegex: probe-only inline regex */
/* eslint-disable no-console */
const runProbe = async (defaultUrl?: string): Promise<void> => {
  const url = process.env.PROBE_URL ?? defaultUrl
  if (!url) {
    console.error('probe: set PROBE_URL or pass a default to runProbe()')
    process.exit(1)
  }
  const t0 = Date.now()
  const log = (msg: string): void => console.log(`[+${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`)
  let failed = 0
  const fail = (msg: string): void => {
    failed += 1
    console.error(`  ✘ ${msg}`)
  }
  const pass = (msg: string): void => console.log(`  ✔ ${msg}`)
  log(`probe ${url}`)
  const res = await fetch(url, { redirect: 'manual' })
  log(`status=${res.status} ct=${res.headers.get('content-type') ?? ''}`)
  if ([200, 307, 308, 401, 403].includes(res.status)) pass(`status ${res.status} ok (deployment serving)`)
  else fail(`expected 200/307/308/401/403, got ${res.status}`)
  const csp = res.headers.get('content-security-policy') ?? ''
  if (csp.includes("'strict-dynamic'")) fail("CSP has 'strict-dynamic' — known regression: blocks Next bootstrap scripts")
  else pass("no 'strict-dynamic' in CSP")
  if (/nonce-[A-Za-z0-9+/=]+/u.test(csp))
    fail('CSP uses nonce — Next 16 RSC inline scripts are not auto-nonced; known regression')
  else pass('no nonce-* in CSP')
  if (csp && !csp.includes("'self'")) fail("CSP missing 'self'")
  else pass("CSP allows 'self' (or empty)")
  const body = await res.text()
  log(`body bytes=${body.length}`)
  if (body.length < 500) fail('body suspiciously short — likely SSR Loading-only page')
  else pass('body has content')
  const hasBootstrap = body.includes('__next_f') || body.includes('_next/static') || body.includes('<script')
  if (hasBootstrap) pass('Next.js bootstrap present')
  else fail('no Next.js bootstrap markers — page is SSR-only / hydration broken')
  const onlyLoading = /^[^<]*<[^>]*Loading\.\.\.[^<]*<\/[^>]*>[^<]*$/iu.test(body)
  if (onlyLoading) fail('body is only a Loading… element')
  const t1 = Date.now()
  const cb = await fetch(`${url}/auth/__probe__`, { redirect: 'manual' }).catch(() => null)
  if (!cb) fail('auth callback endpoint unreachable')
  else if (cb.status >= 500) fail(`auth callback returned ${cb.status} — backend wired badly`)
  else pass(`auth callback responded ${cb.status} in ${Date.now() - t1}ms`)
  console.log(`\n${failed === 0 ? '✔ probe passed' : `✘ ${failed} failures`}`)
  process.exit(failed > 0 ? 1 : 0)
}
export { runProbe }
