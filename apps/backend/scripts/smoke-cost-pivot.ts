#!/usr/bin/env bun
/* eslint-disable no-console, @typescript-eslint/no-unnecessary-condition */
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
const today = new Date().toISOString().slice(0, 10)
console.log('[cost-pivot] wipe + seed 4 rows across 2 owners')
await c.mutation(api.testing.wipeCostRecords, { testSecret })
await c.mutation(api.testing.seedCostRecord, {
  cents: 100,
  dayKey: today,
  model: 'kimi-for-coding',
  owner: 'alice@example.com',
  testSecret
})
await c.mutation(api.testing.seedCostRecord, {
  cents: 200,
  dayKey: today,
  model: 'kimi-for-coding',
  owner: 'alice@example.com',
  testSecret
})
await c.mutation(api.testing.seedCostRecord, {
  cents: 500,
  dayKey: today,
  model: 'kimi-for-coding',
  owner: 'bob@example.com',
  testSecret
})
await c.mutation(api.testing.seedCostRecord, {
  cents: 50,
  dayKey: today,
  model: 'kimi-for-coding',
  owner: 'bob@example.com',
  testSecret
})
const pivot = (await c.query(api.testing.costCyclePivotProbe, { testSecret })) as {
  cents: number
  inputTokens: number
  model: string
  outputTokens: number
  owner: string
}[]
check('2 pivot rows after dedup', pivot.length === 2, `length=${pivot.length}`)
check(
  'sorted by cost desc — bob first (550c)',
  pivot[0]?.owner === 'bob@example.com' && pivot[0]?.cents === 550,
  `top=${JSON.stringify(pivot[0])}`
)
check(
  'alice second (300c)',
  pivot[1]?.owner === 'alice@example.com' && pivot[1]?.cents === 300,
  `second=${JSON.stringify(pivot[1])}`
)
check('inputTokens aggregated', pivot[0]?.inputTokens === 200, `inputTokens=${pivot[0]?.inputTokens}`)
console.log(`\n[cost-pivot] SUMMARY pass=${pass} fail=${fail} total=4`)
if (fail > 0) process.exit(1)
