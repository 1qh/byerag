#!/usr/bin/env bun
/* eslint-disable no-console */
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
const U = 'user-attempt@example.com'
console.log('[attempt] wipe + seed topic w/ pool=5 + user')
await c.mutation(api.testing.wipeUserProfiles, { testSecret })
await c.mutation(api.testing.wipeTrainingTables, { testSecret })
await c.mutation(api.testing.seedUserProfile, { role: 'user', testSecret, userId: U })
const topicId = await c.mutation(api.testing.seedTopicWithPool, { name: 'Security', poolSize: 5, testSecret })
const a1 = await c.mutation(api.testing.startAttemptProbe, {
  testSecret,
  topicId: topicId as never,
  userId: U
})
check('first attempt kind=self (no assignment)', a1.kind === 'self', `kind=${a1.kind}`)
console.log('[attempt] submit all-correct → pass')
const s1 = await c.mutation(api.testing.submitAttemptProbe, {
  answers: [0, 0, 0, 0, 0],
  attemptId: a1.attemptId as never,
  testSecret
})
check('all-correct: passed=true score=5', s1.passed && s1.score === 5, `passed=${s1.passed} score=${s1.score}`)
console.log('[attempt] new attempt → cancels prior')
const a2 = (await c.mutation(api.testing.startAttemptProbe, {
  testSecret,
  topicId: topicId as never,
  userId: U
})) as { attemptId: string }
check('second attempt new attemptId', a2.attemptId !== a1.attemptId, `a1=${a1.attemptId} a2=${a2.attemptId}`)
console.log('[attempt] submit 4/5 → fail')
const s2 = await c.mutation(api.testing.submitAttemptProbe, {
  answers: [0, 0, 0, 0, 1],
  attemptId: a2.attemptId as never,
  testSecret
})
check('4/5 wrong: passed=false score=4', !s2.passed && s2.score === 4, `passed=${s2.passed} score=${s2.score}`)
console.log('[attempt] assign topic + start → kind=assigned')
await c.mutation(api.testing.seedAssignment, {
  createdBy: 'admin@example.com',
  testSecret,
  topicId: topicId as never,
  userId: U
})
const a3 = (await c.mutation(api.testing.startAttemptProbe, {
  testSecret,
  topicId: topicId as never,
  userId: U
})) as { kind: string }
check('assigned-attempt kind=assigned', a3.kind === 'assigned', `kind=${a3.kind}`)
console.log('[attempt] seed shallow topic poolSize=3 → start must reject')
await c.mutation(api.testing.wipeTrainingTables, { testSecret })
await c.mutation(api.testing.seedUserProfile, { role: 'user', testSecret, userId: U })
const shallowTopic = await c.mutation(api.testing.seedTopicWithPool, {
  name: 'Shallow',
  poolSize: 3,
  testSecret
})
let rejected = false
let rejectMsg = ''
try {
  await c.mutation(api.testing.startAttemptProbe, { testSecret, topicId: shallowTopic as never, userId: U })
} catch (error) {
  rejected = true
  rejectMsg = String(error)
}
check(
  'shallow pool start rejected (pool < 5)',
  rejected && rejectMsg.includes('pool < 5'),
  `rejected=${rejected} msg=${rejectMsg.slice(0, 80)}`
)
console.log(`\n[attempt] SUMMARY pass=${pass} fail=${fail} total=5`)
if (fail > 0) process.exit(1)
