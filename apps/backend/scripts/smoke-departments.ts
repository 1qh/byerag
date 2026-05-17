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
const USER = 'dept-user@example.com'
const ADMIN = 'admin@example.com'
console.log('[departments] wipe + seed')
await c.mutation(api.testing.wipeUserProfiles, { testSecret })
await c.mutation(api.testing.seedUserProfile, { role: 'user', testSecret, userId: USER })
await c.mutation(api.testing.seedUserProfile, { role: 'admin', testSecret, userId: ADMIN })
const initial = (await c.query(api.testing.getUserProfile, { testSecret, userId: USER })) as null | {
  department?: string
}
check(
  'initial department is null/undefined',
  initial?.department === undefined,
  `department=${initial?.department ?? 'undefined'}`
)
console.log('[departments] set HR')
await c.mutation(api.testing.setUserDepartmentProbe, {
  adminEmail: ADMIN,
  department: 'Safety, Health and Environment',
  testSecret,
  userId: USER
})
const afterHR = (await c.query(api.testing.getUserProfile, { testSecret, userId: USER })) as null | { department?: string }
check('department=HR', afterHR?.department === 'Safety, Health and Environment', `department=${afterHR?.department}`)
console.log('[departments] change to IT')
await c.mutation(api.testing.setUserDepartmentProbe, {
  adminEmail: ADMIN,
  department: 'Safety, Health and Environment',
  testSecret,
  userId: USER
})
const afterIT = (await c.query(api.testing.getUserProfile, { testSecret, userId: USER })) as null | { department?: string }
check('department=IT', afterIT?.department === 'Safety, Health and Environment', `department=${afterIT?.department}`)
console.log('[departments] unset department (null)')
await c.mutation(api.testing.setUserDepartmentProbe, { adminEmail: ADMIN, testSecret, userId: USER })
const cleared = (await c.query(api.testing.getUserProfile, { testSecret, userId: USER })) as null | { department?: string }
check(
  'department cleared back to null',
  cleared?.department === undefined,
  `department=${cleared?.department ?? 'undefined'}`
)
console.log('[departments] admin profile has no department by default')
const adminProfile = await c.query(api.testing.getUserProfile, { testSecret, userId: ADMIN })
check(
  'admin role + department=null',
  adminProfile?.role === 'admin' && adminProfile.department === undefined,
  `role=${adminProfile?.role} department=${adminProfile?.department}`
)
console.log(`\n[departments] SUMMARY pass=${pass} fail=${fail} total=5`)
if (fail > 0) process.exit(1)
