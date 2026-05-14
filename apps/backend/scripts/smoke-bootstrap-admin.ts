#!/usr/bin/env bun
/* eslint-disable no-console */
/** biome-ignore-all lint/style/noProcessEnv: smoke */
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
const ADMIN = 'bootstrap-admin@example.com'
const PLAIN = 'plain-user@example.com'
const admins = [ADMIN, 'another-admin@example.com']
await c.mutation(api.testing.wipeUserProfiles, { testSecret })
const a = await c.mutation(api.testing.createOrUpdateUserProbe, { bootstrapAdmins: admins, email: ADMIN, testSecret })
check('first sign-in for BOOTSTRAP_ADMIN → role=admin', a.role === 'admin', JSON.stringify(a))
const p = await c.mutation(api.testing.createOrUpdateUserProbe, { bootstrapAdmins: admins, email: PLAIN, testSecret })
check('first sign-in for non-bootstrap → role=user', p.role === 'user', JSON.stringify(p))
const a2 = await c.mutation(api.testing.createOrUpdateUserProbe, { bootstrapAdmins: admins, email: ADMIN, testSecret })
check('re-sign-in preserves admin role (idempotent)', a2.role === 'admin', JSON.stringify(a2))
console.log(`\n[bootstrap-admin] SUMMARY pass=${pass} fail=${fail} total=3`)
if (fail > 0) process.exit(1)
