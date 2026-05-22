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
const env = parseEnv(readFileSync(join(import.meta.dir, '..', '.env'), 'utf8'))
const url = env.CONVEX_SELF_HOSTED_URL ?? ''
const testSecret = env.TEST_SECRET ?? ''
if (!(url && testSecret)) {
  console.error('env missing')
  process.exit(2)
}
const c = new ConvexHttpClient(url)
const OWNER = `budget-cap-${Date.now()}@example.com`
const DAILY_CENTS_CAP = 2500
console.log(`[budget-cap] owner=${OWNER}`)
console.log('[budget-cap] wipe owner spend')
await c.mutation(api.testing.wipeAllForOwner, { email: OWNER, testSecret })
let pass = 0
let fail = 0
const check = (label: string, ok: boolean, detail: string): void => {
  console.log(`${ok ? '✓' : '✗'} ${label}: ${detail}`)
  if (ok) pass += 1
  else fail += 1
}
console.log('[budget-cap] reserve 100c — under cap')
const r1 = await c.action(api.testing.reserveBudgetProbe, { cents: 100, owner: OWNER, testSecret })
check('reserve 100c ok', r1.ok, `centsToday=${r1.centsToday} reason=${r1.reason ?? '—'}`)
console.log('[budget-cap] reserve 2400c — drives to cap')
const r2 = await c.action(api.testing.reserveBudgetProbe, { cents: 2400, owner: OWNER, testSecret })
check('reserve 2400c ok (at cap)', r2.ok && r2.centsToday === DAILY_CENTS_CAP, `centsToday=${r2.centsToday}`)
console.log('[budget-cap] reserve 1c — past cap → must reject')
const r3 = await c.action(api.testing.reserveBudgetProbe, { cents: 1, owner: OWNER, testSecret })
check('reserve past cap rejected', !r3.ok && r3.reason === 'cap', `ok=${r3.ok} reason=${r3.reason ?? '—'}`)
check('rejection preserves centsToday', r3.centsToday === DAILY_CENTS_CAP, `centsToday=${r3.centsToday}`)
console.log(`\n[budget-cap] SUMMARY pass=${pass} fail=${fail} total=4`)
if (fail > 0) process.exit(1)
