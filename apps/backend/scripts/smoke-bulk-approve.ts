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
let pass = 0
let fail = 0
const check = (label: string, ok: boolean, detail: string): void => {
  console.log(`${ok ? '✓' : '✗'} ${label}: ${detail}`)
  if (ok) pass += 1
  else fail += 1
}
const ADMIN = 'bulk-admin@example.com'
console.log('[bulk-approve] wipe + seed topic + 3 pending suggestions')
await c.mutation(api.testing.wipeTrainingTables, { testSecret })
const topicId = await c.mutation(api.testing.seedTopicWithPool, { name: 'Bulk', poolSize: 0, testSecret })
const sids: string[] = []
for (let i = 1; i <= 3; i += 1) {
  const sid = await c.mutation(api.testing.seedSuggestion, {
    choices: ['A', 'B', 'C'],
    correctIndex: 0,
    prompt: `Bulk Q${i}?`,
    testSecret,
    topicId: topicId as never
  })
  sids.push(sid)
}
const before = await c.query(api.testing.countTopicQuestions, { testSecret, topicId: topicId as never })
check('0 canonical questions before approve', before === 0, `count=${before}`)
console.log('[bulk-approve] approve all 3 suggestions sequentially')
for (const sid of sids)
  await c.mutation(api.testing.approveSuggestionProbe, {
    adminEmail: ADMIN,
    suggestionId: sid as never,
    testSecret
  })
const after = await c.query(api.testing.countTopicQuestions, { testSecret, topicId: topicId as never })
check('3 canonical questions after approve', after === 3, `count=${after}`)
console.log(`\n[bulk-approve] SUMMARY pass=${pass} fail=${fail} total=2`)
if (fail > 0) process.exit(1)
