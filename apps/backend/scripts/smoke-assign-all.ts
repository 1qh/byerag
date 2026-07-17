#!/usr/bin/env bun
/* eslint-disable no-console, no-await-in-loop */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential by design */
import { ConvexHttpClient } from 'convex/browser'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { api } from '../convex/_generated/api'
import { parseEnv } from './lib/env'
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
const ADMIN = 'assignall-admin@example.com'
const U1 = 'aa-u1@example.com'
const U2 = 'aa-u2@example.com'
const U3 = 'aa-u3@example.com'
console.log('[assign-all] wipe + seed 3 users (one already-passed) + 1 admin + topic pool=5')
await c.mutation(api.testing.wipeUserProfiles, { testSecret })
await c.mutation(api.testing.wipeTrainingTables, { testSecret })
await c.mutation(api.testing.seedUserProfile, { role: 'admin', testSecret, userId: ADMIN })
for (const u of [U1, U2, U3]) await c.mutation(api.testing.seedUserProfile, { role: 'user', testSecret, userId: u })
const topicId = await c.mutation(api.testing.seedTopicWithPool, { name: 'AA', poolSize: 5, testSecret })
await c.mutation(api.testing.seedTestPass, { kind: 'assigned', testSecret, topicId: topicId as never, userId: U1 })
console.log('[assign-all] call assignAllForTopicProbe → should skip U1, assign U2 + U3')
const r1 = await c.mutation(api.testing.assignAllForTopicProbe, {
  adminEmail: ADMIN,
  testSecret,
  topicId: topicId as never
})
check('assignmentsCreated === 2 (U1 skipped)', r1.assignmentsCreated === 2, `created=${r1.assignmentsCreated}`)
console.log('[assign-all] re-call → idempotent, 0 new')
const r2 = await c.mutation(api.testing.assignAllForTopicProbe, {
  adminEmail: ADMIN,
  testSecret,
  topicId: topicId as never
})
check('re-run created=0', r2.assignmentsCreated === 0, `created=${r2.assignmentsCreated}`)
console.log('[assign-all] start in-progress attempt for U2')
await c.mutation(api.testing.startAttemptProbe, { testSecret, topicId: topicId as never, userId: U2 })
console.log('[assign-all] unassignAll → soft-deletes assignments + cancels in-progress attempts')
const u1 = await c.mutation(api.testing.unassignAllForTopicProbe, {
  adminEmail: ADMIN,
  testSecret,
  topicId: topicId as never
})
check('unassignmentsCancelled === 2', u1.assignmentsCancelled === 2, `cancelled=${u1.assignmentsCancelled}`)
check('inProgress attempts cancelled === 1', u1.inProgressCancelled === 1, `inProgressCancelled=${u1.inProgressCancelled}`)
console.log('[assign-all] re-assign after unassign → refills U2+U3 (U1 still skipped via testPasses)')
const r3 = await c.mutation(api.testing.assignAllForTopicProbe, {
  adminEmail: ADMIN,
  testSecret,
  topicId: topicId as never
})
check('re-fill after unassign created=2', r3.assignmentsCreated === 2, `created=${r3.assignmentsCreated}`)
console.log(`\n[assign-all] SUMMARY pass=${pass} fail=${fail} total=5`)
if (fail > 0) process.exit(1)
