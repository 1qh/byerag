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
console.log('[skip-pass] wipe')
await c.mutation(api.testing.wipeUserProfiles, { testSecret })
await c.mutation(api.testing.wipeTrainingTables, { testSecret })
const A = 'alice@example.com'
const B = 'bob@example.com'
await c.mutation(api.testing.seedUserProfile, { role: 'user', testSecret, userId: A })
await c.mutation(api.testing.seedUserProfile, { role: 'user', testSecret, userId: B })
const topicId = await c.mutation(api.testing.seedTopicWithPool, { name: 'Security', poolSize: 5, testSecret })
console.log(`[skip-pass] seed pass for alice on topic ${topicId} (kind=assigned)`)
await c.mutation(api.testing.seedTestPass, { kind: 'assigned', testSecret, topicId: topicId as never, userId: A })
await c.mutation(api.testing.setSetting, { key: 'agent_auto_assign_enabled', testSecret, value: 'true' })
const r = (await c.action(api.testing.runAutoAssign, { testSecret })) as { assignmentsCreated: number }
check('1 assignment created (bob only, alice skipped)', r.assignmentsCreated === 1, `created=${r.assignmentsCreated}`)
const agentCount = await c.query(api.testing.countAssignmentsByCreator, {
  createdBy: 'agent',
  testSecret
})
check('exactly 1 row createdBy=agent', agentCount === 1, `count=${agentCount}`)
console.log(`\n[skip-pass] SUMMARY pass=${pass} fail=${fail} total=2`)
if (fail > 0) process.exit(1)
