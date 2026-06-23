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
const U = 'ctx-token-user@example.com'
console.log('[active-token] tab A claims token T1')
await c.mutation(api.testing.claimContextProbe, { testSecret, token: 'T1', userId: U })
const h1 = await c.mutation(api.testing.heartbeatProbe, { testSecret, token: 'T1', userId: U })
check('tab A heartbeat ok with T1', h1, `h1=${h1}`)
console.log('[active-token] tab B opens with stale token T2 → heartbeat denied')
const h2stale = await c.mutation(api.testing.heartbeatProbe, { testSecret, token: 'T2', userId: U })
check('stale tab heartbeat denied', !h2stale, `h2stale=${h2stale}`)
console.log('[active-token] tab B clicks Take over → claim T2')
await c.mutation(api.testing.claimContextProbe, { testSecret, token: 'T2', userId: U })
const h2 = await c.mutation(api.testing.heartbeatProbe, { testSecret, token: 'T2', userId: U })
check('tab B heartbeat ok with T2', h2, `h2=${h2}`)
const h1stale = await c.mutation(api.testing.heartbeatProbe, { testSecret, token: 'T1', userId: U })
check('original tab A heartbeat now denied', !h1stale, `h1stale=${h1stale}`)
console.log(`\n[active-token] SUMMARY pass=${pass} fail=${fail} total=4`)
if (fail > 0) process.exit(1)
