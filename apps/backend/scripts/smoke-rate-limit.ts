#!/usr/bin/env bun
/* eslint-disable no-console, no-await-in-loop */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential by design */
/* oxlint-disable eslint(no-await-in-loop), eslint(no-shadow), eslint(no-unused-expressions), eslint(max-params), eslint(no-unused-vars), promise(param-names), unicorn(prefer-native-coercion-functions), unicorn(prefer-ternary) */
/** biome-ignore-all lint/style/noProcessEnv: smoke reads .env directly */
/** biome-ignore-all lint/nursery/noUndeclaredEnvVars: smoke env */
import { ConvexHttpClient } from 'convex/browser'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { api } from '../convex/_generated/api'
const ENV_LINE = /^\s*(?<key>[A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?<val>.*?)\s*$/u
const parseEnv = (text: string): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (t && !t.startsWith('#')) {
      const m = ENV_LINE.exec(line)
      const key = m?.groups?.key
      if (key) out[key] = (m.groups?.val ?? '').replaceAll(/^["']|["']$/gu, '')
    }
  }
  return out
}
const env = parseEnv(readFileSync(join(import.meta.dir, '..', '.env'), 'utf8'))
const url = env.CONVEX_SELF_HOSTED_URL ?? ''
const testSecret = env.TEST_SECRET ?? ''
if (!(url && testSecret)) {
  console.error('env missing')
  process.exit(2)
}
const c = new ConvexHttpClient(url)
const OWNER = `rate-limit-${Date.now()}@example.com`
const MAX = 5
console.log(`[rate-limit] owner=${OWNER} max=${MAX}`)
let pass = 0
let fail = 0
const check = (label: string, ok: boolean, detail: string): void => {
  console.log(`${ok ? '✓' : '✗'} ${label}: ${detail}`)
  if (ok) pass += 1
  else fail += 1
}
const results: boolean[] = []
for (let i = 1; i <= MAX + 2; i += 1) {
  const allowed = await c.action(api.testing.checkRateLimitProbe, { max: MAX, owner: OWNER, testSecret })
  results.push(allowed)
  console.log(`  call ${i}: allowed=${allowed}`)
}
const firstN = results.slice(0, MAX)
const overflow = results.slice(MAX)
check('first MAX calls all allowed', firstN.every(Boolean), `firstN=${JSON.stringify(firstN)}`)
check(
  'overflow calls rejected',
  overflow.every(r => !r),
  `overflow=${JSON.stringify(overflow)}`
)
check('total allowed === MAX', results.filter(Boolean).length === MAX, `count=${results.filter(Boolean).length}`)
console.log(`\n[rate-limit] SUMMARY pass=${pass} fail=${fail} total=3`)
if (fail > 0) process.exit(1)
