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
const ADMIN = 'rearm-admin@example.com'
const U1 = 'rearm-u1@example.com'
const U2 = 'rearm-u2@example.com'
console.log('[rearm] wipe + seed: U1 has assigned pass, U2 has self pass')
await c.mutation(api.testing.wipeUserProfiles, { testSecret })
await c.mutation(api.testing.wipeTrainingTables, { testSecret })
await c.mutation(api.testing.seedUserProfile, { role: 'admin', testSecret, userId: ADMIN })
await c.mutation(api.testing.seedUserProfile, { role: 'user', testSecret, userId: U1 })
await c.mutation(api.testing.seedUserProfile, { role: 'user', testSecret, userId: U2 })
const topicId = await c.mutation(api.testing.seedTopicWithPool, { name: 'Rearm', poolSize: 5, testSecret })
await c.mutation(api.testing.seedTestPass, { kind: 'assigned', testSecret, topicId: topicId as never, userId: U1 })
await c.mutation(api.testing.seedTestPass, { kind: 'self', testSecret, topicId: topicId as never, userId: U2 })
const before = await c.query(api.testing.countTestPasses, { testSecret, topicId: topicId as never })
check(
  '1 assigned pass + 1 self pass before re-arm',
  before.assignedKind === 1 && before.selfKind === 1,
  `assigned=${before.assignedKind} self=${before.selfKind}`
)
console.log('[rearm] mark topic substantive → revoke assigned-pass + re-insert assignment')
const r = await c.mutation(api.testing.markTopicSubstantiveProbe, {
  adminEmail: ADMIN,
  testSecret,
  topicId: topicId as never
})
check('passesRevoked === 1', r.passesRevoked === 1, `revoked=${r.passesRevoked}`)
check('assignmentsCreated === 1 (U1 re-assigned)', r.assignmentsCreated === 1, `created=${r.assignmentsCreated}`)
const after = await c.query(api.testing.countTestPasses, { testSecret, topicId: topicId as never })
check('assigned-kind pass deleted', after.assignedKind === 0, `assigned=${after.assignedKind}`)
check('self-kind pass UNTOUCHED', after.selfKind === 1, `self=${after.selfKind}`)
console.log(`\n[rearm] SUMMARY pass=${pass} fail=${fail} total=5`)
if (fail > 0) process.exit(1)
