#!/usr/bin/env bun
/* eslint-disable no-console */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential by design */
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
const email = (env.BOOTSTRAP_ADMIN_EMAIL ?? '').split(',')[0]?.trim() ?? ''
if (!(url && testSecret && email)) {
  console.error('env missing')
  process.exit(2)
}
const c = new ConvexHttpClient(url)
const PROXY_CALLS_PER_TURN_CAP = 200
let pass = 0
let fail = 0
const check = (label: string, ok: boolean, detail: string): void => {
  console.log(`${ok ? '✓' : '✗'} ${label}: ${detail}`)
  if (ok) pass += 1
  else fail += 1
}
console.log('[turn-budget] seed chat')
const chatId = (await c.mutation(api.testing.send, {
  app: 'user',
  content: 'seed',
  email,
  testSecret
})) as string
console.log(`[turn-budget] chatId=${chatId} — ensure chatRuntime at 0`)
await c.mutation(api.testing.ensureChatRuntime, { chatId: chatId as never, testSecret })
console.log(`[turn-budget] consuming ${PROXY_CALLS_PER_TURN_CAP + 2} budget tokens sequentially`)
const results: boolean[] = []
for (let i = 1; i <= PROXY_CALLS_PER_TURN_CAP + 2; i += 1) {
  const ok = await c.action(api.testing.consumeProxyBudgetProbe, { chatId: chatId as never, testSecret })
  results.push(ok)
  if (i === 1 || i === PROXY_CALLS_PER_TURN_CAP || i === PROXY_CALLS_PER_TURN_CAP + 1) console.log(`  call ${i}: ok=${ok}`)
}
const firstN = results.slice(0, PROXY_CALLS_PER_TURN_CAP)
const overflow = results.slice(PROXY_CALLS_PER_TURN_CAP)
check(
  'first 200 calls all allowed',
  firstN.every(r => r),
  `firstN passed=${firstN.filter(r => r).length}/${PROXY_CALLS_PER_TURN_CAP}`
)
check(
  'calls past cap rejected',
  overflow.every(r => !r),
  `overflow=${JSON.stringify(overflow)}`
)
check(
  'total allowed === cap',
  results.filter(r => r).length === PROXY_CALLS_PER_TURN_CAP,
  `count=${results.filter(r => r).length}`
)
console.log('[turn-budget] reset turn → next call allowed again')
await c.mutation(api.testing.ensureChatRuntime, { chatId: chatId as never, testSecret })
const postReset = await c.action(api.testing.consumeProxyBudgetProbe, {
  chatId: chatId as never,
  testSecret
})
check('post-reset call allowed', postReset, `ok=${postReset}`)
console.log(`\n[turn-budget] SUMMARY pass=${pass} fail=${fail} total=4`)
if (fail > 0) process.exit(1)
