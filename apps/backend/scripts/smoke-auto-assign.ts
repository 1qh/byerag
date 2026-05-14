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
console.log('[auto-assign] wipe + seed 2 users + 2 topics (pool=5 each)')
await c.mutation(api.testing.wipeUserProfiles, { testSecret })
await c.mutation(api.testing.wipeTrainingTables, { testSecret })
await c.mutation(api.testing.seedUserProfile, { role: 'user', testSecret, userId: 'alice@example.com' })
await c.mutation(api.testing.seedUserProfile, { role: 'user', testSecret, userId: 'bob@example.com' })
await c.mutation(api.testing.seedUserProfile, { role: 'admin', testSecret, userId: 'admin@example.com' })
await c.mutation(api.testing.seedTopicWithPool, { name: 'Security', poolSize: 5, testSecret })
await c.mutation(api.testing.seedTopicWithPool, { name: 'Quality', poolSize: 5, testSecret })
console.log('[auto-assign] flag disabled → cron should be no-op')
await c.mutation(api.testing.setSetting, { key: 'agent_auto_assign_enabled', testSecret, value: 'false' })
const r1 = (await c.action(api.testing.runAutoAssign, { testSecret })) as {
  assignmentsCreated: number
  topicsProcessed: number
}
check('disabled cron: 0 assignments', r1.assignmentsCreated === 0, `created=${r1.assignmentsCreated}`)
check('disabled cron: 0 topics processed', r1.topicsProcessed === 0, `topicsProcessed=${r1.topicsProcessed}`)
console.log('[auto-assign] enable flag')
await c.mutation(api.testing.setSetting, { key: 'agent_auto_assign_enabled', testSecret, value: 'true' })
const r2 = (await c.action(api.testing.runAutoAssign, { testSecret })) as {
  assignmentsCreated: number
  topicsProcessed: number
}
check('enabled cron: 4 assignments (2 users × 2 topics)', r2.assignmentsCreated === 4, `created=${r2.assignmentsCreated}`)
check('enabled cron: 2 topics processed', r2.topicsProcessed === 2, `topicsProcessed=${r2.topicsProcessed}`)
const agentCount = await c.query(api.testing.countAssignmentsByCreator, { createdBy: 'agent', testSecret })
check('all 4 rows createdBy=agent', agentCount === 4, `count=${agentCount}`)
console.log('[auto-assign] re-run cron — idempotent (no new rows, already covered)')
const r3 = (await c.action(api.testing.runAutoAssign, { testSecret })) as { assignmentsCreated: number }
check('re-run cron: 0 new assignments', r3.assignmentsCreated === 0, `created=${r3.assignmentsCreated}`)
const audit = (await c.query(api.testing.countAuditLogs, { testSecret })) as { sampleCommands: string[] }
check(
  'audit has training.cron.run row',
  audit.sampleCommands.includes('training.cron.run'),
  `sample=${audit.sampleCommands.join(',')}`
)
console.log(`\n[auto-assign] SUMMARY pass=${pass} fail=${fail} total=7`)
if (fail > 0) process.exit(1)
