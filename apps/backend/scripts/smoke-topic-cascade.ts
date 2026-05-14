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
const U = 'cascade-user@example.com'
const ADMIN = 'cascade-admin@example.com'
console.log('[cascade] wipe + seed user + topic pool=5 + assignment + in-progress attempt')
await c.mutation(api.testing.wipeUserProfiles, { testSecret })
await c.mutation(api.testing.wipeTrainingTables, { testSecret })
await c.mutation(api.testing.seedUserProfile, { role: 'user', testSecret, userId: U })
await c.mutation(api.testing.seedUserProfile, { role: 'admin', testSecret, userId: ADMIN })
const topicId = await c.mutation(api.testing.seedTopicWithPool, { name: 'CascTopic', poolSize: 5, testSecret })
const sugId = await c.mutation(api.testing.seedSuggestion, {
  choices: ['A', 'B', 'C'],
  correctIndex: 0,
  prompt: 'pending-sug',
  testSecret,
  topicId: topicId as never
})
await c.mutation(api.testing.seedAssignment, { createdBy: ADMIN, testSecret, topicId: topicId as never, userId: U })
const a1 = (await c.mutation(api.testing.startAttemptProbe, { testSecret, topicId: topicId as never, userId: U })) as {
  attemptId: string
}
console.log('[cascade] delete topic')
const r = await c.mutation(api.testing.adminDeleteTopicProbe, {
  adminEmail: ADMIN,
  testSecret,
  topicId: topicId as never
})
check('5 questions soft-deleted', r.questionsDeleted === 5, `count=${r.questionsDeleted}`)
check('1 assignment cancelled', r.assignmentsCancelled === 1, `count=${r.assignmentsCancelled}`)
check('1 in-progress attempt cancelled', r.attemptsCancelled === 1, `count=${r.attemptsCancelled}`)
const topic = (await c.query(api.testing.getTopicRow, { testSecret, topicId: topicId as never })) as null | {
  deletedAt?: number
}
check('topic.deletedAt set', typeof topic?.deletedAt === 'number', `deletedAt=${topic?.deletedAt ?? 'null'}`)
const sug = (await c.query(api.testing.getSuggestionRow, { suggestionId: sugId as never, testSecret })) as null | {
  resolvedReason?: string
  status?: string
}
check(
  'pending suggestion → resolvedReason=topic-deleted, status=resolved',
  sug?.resolvedReason === 'topic-deleted' && sug?.status === 'resolved',
  `reason=${sug?.resolvedReason ?? 'null'} status=${sug?.status ?? 'null'}`
)
console.log(`\n[cascade] SUMMARY pass=${pass} fail=${fail} total=5`)
if (fail > 0) process.exit(1)
