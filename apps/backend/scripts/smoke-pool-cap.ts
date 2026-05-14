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
console.log('[pool-cap] wipe + seed topic')
await c.mutation(api.testing.wipeTrainingTables, { testSecret })
const topicId = await c.mutation(api.testing.seedTopicWithPool, { name: 'CapT', poolSize: 5, testSecret })
const t1 = await c.query(api.testing.getTopicPoolCap, { testSecret, topicId: topicId as never })
check('default poolCap === 50', t1?.poolCap === 50, `poolCap=${t1?.poolCap}`)
console.log('[pool-cap] adjust poolCap to 75')
await c.mutation(api.testing.setTopicPoolCap, { poolCap: 75, testSecret, topicId: topicId as never })
const t2 = await c.query(api.testing.getTopicPoolCap, { testSecret, topicId: topicId as never })
check('poolCap updated to 75', t2?.poolCap === 75, `poolCap=${t2?.poolCap}`)
console.log(`\n[pool-cap] SUMMARY pass=${pass} fail=${fail} total=2`)
if (fail > 0) process.exit(1)
