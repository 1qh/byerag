#!/usr/bin/env bun
/* eslint-disable no-console */
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
const A = 'admin-a@example.com'
const B = 'admin-b@example.com'
const U = 'user-c@example.com'
console.log('[role-guard] wipe userProfiles + seed two admins + one user')
await c.mutation(api.testing.wipeUserProfiles, { testSecret })
await c.mutation(api.testing.seedUserProfile, { role: 'admin', testSecret, userId: A })
await c.mutation(api.testing.seedUserProfile, { role: 'admin', testSecret, userId: B })
await c.mutation(api.testing.seedUserProfile, { role: 'user', testSecret, userId: U })
console.log('[role-guard] promote U to admin')
const promote = await c.mutation(api.testing.setUserRoleProbe, {
  adminEmail: A,
  role: 'admin',
  testSecret,
  userId: U
})
check('promote user to admin ok', promote.ok, `err=${promote.error ?? '—'}`)
let n = await c.query(api.testing.countAdmins, { testSecret })
check('3 admins after promote', n === 3, `count=${n}`)
console.log('[role-guard] demote A to user')
const demoteA = await c.mutation(api.testing.setUserRoleProbe, {
  adminEmail: A,
  role: 'user',
  testSecret,
  userId: A
})
check('demote A ok (others remain)', demoteA.ok, `err=${demoteA.error ?? '—'}`)
console.log('[role-guard] demote B')
const demoteB = await c.mutation(api.testing.setUserRoleProbe, {
  adminEmail: B,
  role: 'user',
  testSecret,
  userId: B
})
check('demote B ok (U still admin)', demoteB.ok, `err=${demoteB.error ?? '—'}`)
n = await c.query(api.testing.countAdmins, { testSecret })
check('1 admin remaining', n === 1, `count=${n}`)
console.log('[role-guard] try demote last admin U — must reject')
const demoteLast = await c.mutation(api.testing.setUserRoleProbe, {
  adminEmail: U,
  role: 'user',
  testSecret,
  userId: U
})
check(
  'demote last admin rejected',
  !demoteLast.ok && demoteLast.error === 'cannot demote last admin',
  `ok=${demoteLast.ok} err=${demoteLast.error ?? '—'}`
)
n = await c.query(api.testing.countAdmins, { testSecret })
check('still 1 admin after rejection', n === 1, `count=${n}`)
console.log(`\n[role-guard] SUMMARY pass=${pass} fail=${fail} total=6`)
if (fail > 0) process.exit(1)
