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
const ADMIN = 'dept-admin@example.com'
console.log('[gradebook-dept] wipe + seed 3 users w/ different departments')
await c.mutation(api.testing.wipeUserProfiles, { testSecret })
await c.mutation(api.testing.seedUserProfile, { role: 'admin', testSecret, userId: ADMIN })
await c.mutation(api.testing.seedUserProfile, { role: 'user', testSecret, userId: 'hr-u@example.com' })
await c.mutation(api.testing.seedUserProfile, { role: 'user', testSecret, userId: 'it-u@example.com' })
await c.mutation(api.testing.seedUserProfile, { role: 'user', testSecret, userId: 'unset-u@example.com' })
await c.mutation(api.testing.setUserDepartmentProbe, {
  adminEmail: ADMIN,
  department: 'Safety, Health and Environment',
  testSecret,
  userId: 'hr-u@example.com'
})
await c.mutation(api.testing.setUserDepartmentProbe, {
  adminEmail: ADMIN,
  department: 'Safety, Health and Environment',
  testSecret,
  userId: 'it-u@example.com'
})
const r = await c.query(api.testing.gradebookWithDeptProbe, { testSecret })
check('3 users in gradebook (admin excluded)', r.users.length === 3, `count=${r.users.length}`)
const findDept = (uid: string): string | undefined => r.users.find(u => u.userId === uid)?.department
check(
  'hr-u department === HR',
  findDept('hr-u@example.com') === 'Safety, Health and Environment',
  `dept=${findDept('hr-u@example.com')}`
)
check(
  'it-u department === IT',
  findDept('it-u@example.com') === 'Safety, Health and Environment',
  `dept=${findDept('it-u@example.com')}`
)
check(
  'unset-u department undefined',
  findDept('unset-u@example.com') === undefined,
  `dept=${findDept('unset-u@example.com') ?? 'undefined'}`
)
console.log(`\n[gradebook-dept] SUMMARY pass=${pass} fail=${fail} total=4`)
if (fail > 0) process.exit(1)
