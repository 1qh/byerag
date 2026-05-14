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
const U = 'detail-user@example.com'
const OTHER = 'other-user@example.com'
console.log('[detail] wipe + seed topic pool=5 + user')
await c.mutation(api.testing.wipeUserProfiles, { testSecret })
await c.mutation(api.testing.wipeTrainingTables, { testSecret })
await c.mutation(api.testing.seedUserProfile, { role: 'user', testSecret, userId: U })
const topicId = await c.mutation(api.testing.seedTopicWithPool, { name: 'Sec', poolSize: 5, testSecret })
console.log('[detail] passed attempt → returns full snapshot')
const a1 = (await c.mutation(api.testing.startAttemptProbe, { testSecret, topicId: topicId as never, userId: U })) as {
  attemptId: string
}
await c.mutation(api.testing.submitAttemptProbe, {
  answers: [0, 0, 0, 0, 0],
  attemptId: a1.attemptId as never,
  testSecret
})
const d1 = (await c.query(api.testing.attemptDetailProbe, {
  attemptId: a1.attemptId as never,
  callerUserId: U,
  testSecret
})) as { questionSnapshots?: unknown[]; status: string }
check('passed: status=passed', d1?.status === 'passed', `status=${d1?.status}`)
check(
  'passed: questionSnapshots present',
  Array.isArray(d1?.questionSnapshots),
  `snapshots=${d1?.questionSnapshots?.length ?? '—'}`
)
console.log('[detail] failed attempt → score only')
const a2 = (await c.mutation(api.testing.startAttemptProbe, { testSecret, topicId: topicId as never, userId: U })) as {
  attemptId: string
}
await c.mutation(api.testing.submitAttemptProbe, {
  answers: [0, 0, 0, 0, 1],
  attemptId: a2.attemptId as never,
  testSecret
})
const d2 = (await c.query(api.testing.attemptDetailProbe, {
  attemptId: a2.attemptId as never,
  callerUserId: U,
  testSecret
})) as { questionSnapshots?: unknown[]; score?: number; status: string; total?: number }
check('failed: status=failed', d2?.status === 'failed', `status=${d2?.status}`)
check(
  'failed: questionSnapshots absent',
  d2?.questionSnapshots === undefined,
  `snapshots=${d2?.questionSnapshots ?? 'undefined'}`
)
check('failed: score=4 total=5', d2?.score === 4 && d2?.total === 5, `score=${d2?.score} total=${d2?.total}`)
console.log('[detail] other user → forbidden')
let forbidden = false
try {
  await c.query(api.testing.attemptDetailProbe, { attemptId: a2.attemptId as never, callerUserId: OTHER, testSecret })
} catch (error) {
  forbidden = String(error).includes('forbidden')
}
check('cross-user denied (forbidden)', forbidden, `forbidden=${forbidden}`)
console.log(`\n[detail] SUMMARY pass=${pass} fail=${fail} total=6`)
if (fail > 0) process.exit(1)
