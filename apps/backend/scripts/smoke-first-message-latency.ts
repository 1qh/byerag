#!/usr/bin/env bun
/* eslint-disable no-console */
/** biome-ignore-all lint/style/noProcessEnv: smoke reads .env */
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
const sleep = async (ms: number): Promise<void> =>
  new Promise(r => {
    setTimeout(r, ms)
  })
const t0 = Date.now()
const r = (await c.mutation(api.testing.sendWithSecret, {
  app: 'user',
  content: 'list my docs',
  email: 'perf-test@example.com',
  testSecret
})) as { chatId: string; secret: string }
const tSend = Date.now() - t0
console.log(`[latency] sendWithSecret returned chatId=${r.chatId} dt=${tSend}ms`)
const deadline = Date.now() + 10_000
let firstEventAt = 0
while (Date.now() < deadline) {
  const evts = (await c.query(api.testing.listStreamEventsForChat, { chatId: r.chatId as never, testSecret })) as {
    seq: number
  }[]
  if (evts.length > 0) {
    firstEventAt = Date.now() - t0
    break
  }
  await sleep(50)
}
let pass = 0
let fail = 0
const check = (label: string, ok: boolean, detail: string): void => {
  console.log(`${ok ? '✓' : '✗'} ${label}: ${detail}`)
  if (ok) pass += 1
  else fail += 1
}
check(
  'first streamEvent visible < 5000ms (VERIFY 134 end-to-end)',
  firstEventAt > 0 && firstEventAt < 5000,
  `firstEventAt=${firstEventAt}ms tSend=${tSend}ms`
)
console.log(`\n[latency] SUMMARY pass=${pass} fail=${fail} total=1`)
if (fail > 0) process.exit(1)
