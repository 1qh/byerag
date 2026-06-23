#!/usr/bin/env bun
/* eslint-disable no-console */
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
// oxlint-disable-next-line node/no-sync
const env = parseEnv(readFileSync(join(import.meta.dir, '..', '.env'), 'utf8'))
const url = env.CONVEX_SELF_HOSTED_URL ?? ''
const testSecret = env.TEST_SECRET ?? ''
if (!(url && testSecret)) {
  console.error('env missing')
  process.exit(2)
}
const c = new ConvexHttpClient(url)
let pass = 0
let fail = 0
const check = (label: string, ok: boolean, detail: string): void => {
  console.log(`${ok ? '✓' : '✗'} ${label}: ${detail}`)
  if (ok) pass += 1
  else fail += 1
}
const U = 'send-token-user@example.com'
console.log('[send-token] claim T1; probe send with T1 → ok, with T2 → mismatch')
await c.mutation(api.testing.claimContextProbe, { testSecret, token: 'T1', userId: U })
const okR = await c.mutation(api.testing.sendCheckTokenProbe, { activeContextToken: 'T1', testSecret, userId: U })
check('matching token → ok', okR === 'ok', `r=${okR}`)
const badR = await c.mutation(api.testing.sendCheckTokenProbe, { activeContextToken: 'T2', testSecret, userId: U })
check('stale token → mismatch (would throw 403 in public send)', badR === 'mismatch', `r=${badR}`)
console.log(`\n[send-token] SUMMARY pass=${pass} fail=${fail} total=2`)
if (fail > 0) process.exit(1)
