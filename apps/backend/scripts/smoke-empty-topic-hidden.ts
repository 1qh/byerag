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
const U = 'empty-topic-user@example.com'
console.log('[empty-topic] wipe + seed topic A (pool=0) + topic B (pool=3)')
await c.mutation(api.testing.wipeTrainingTables, { testSecret })
const a = await c.mutation(api.testing.seedTopicWithPool, { name: 'Empty', poolSize: 0, testSecret })
const b = await c.mutation(api.testing.seedTopicWithPool, { name: 'NonEmpty', poolSize: 3, testSecret })
const rows = (await c.query(api.testing.listMyTopicsProbe, { testSecret, userId: U })) as {
  _id: string
  name: string
  poolSize: number
}[]
const ids = new Set(rows.map(r => r._id))
check('topic B (pool=3) listed', ids.has(b), `rows=${rows.map(r => `${r.name}:${r.poolSize}`).join(',')}`)
check('topic A (pool=0) hidden', !ids.has(a), `rows=${rows.map(r => `${r.name}:${r.poolSize}`).join(',')}`)
console.log(`\n[empty-topic] SUMMARY pass=${pass} fail=${fail} total=2`)
if (fail > 0) process.exit(1)
