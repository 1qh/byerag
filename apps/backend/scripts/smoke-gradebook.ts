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
console.log('[gradebook] wipe + seed: U1 (passed), U2 (admin-assigned not passed), U3 (agent-assigned), U4 (unassigned)')
await c.mutation(api.testing.wipeUserProfiles, { testSecret })
await c.mutation(api.testing.wipeTrainingTables, { testSecret })
const U1 = 'u1@example.com'
const U2 = 'u2@example.com'
const U3 = 'u3@example.com'
const U4 = 'u4@example.com'
for (const u of [U1, U2, U3, U4]) await c.mutation(api.testing.seedUserProfile, { role: 'user', testSecret, userId: u })
const topicId = await c.mutation(api.testing.seedTopicWithPool, { name: 'Security', poolSize: 5, testSecret })
await c.mutation(api.testing.seedTestPass, { kind: 'assigned', testSecret, topicId: topicId as never, userId: U1 })
await c.mutation(api.testing.seedAssignment, {
  createdBy: 'admin@example.com',
  testSecret,
  topicId: topicId as never,
  userId: U2
})
await c.mutation(api.testing.seedAssignment, { createdBy: 'agent', testSecret, topicId: topicId as never, userId: U3 })
const r = (await c.query(api.testing.gradebookProbe, { testSecret })) as {
  cells: { glyph: string; topicId: string; userId: string }[]
  topics: { _id: string }[]
  users: { userId: string }[]
}
check('1 topic with pool ≥ 5', r.topics.length === 1, `topics=${r.topics.length}`)
check('4 users', r.users.length === 4, `users=${r.users.length}`)
const cellOf = (uid: string): string => r.cells.find(x => x.userId === uid)?.glyph ?? '?'
check('U1 cell === ✓ (passed)', cellOf(U1) === '✓', `glyph=${cellOf(U1)}`)
check('U2 cell === ✗ (admin assigned, not passed)', cellOf(U2) === '✗', `glyph=${cellOf(U2)}`)
check('U3 cell === ⓐ (agent assigned, not passed)', cellOf(U3) === 'ⓐ', `glyph=${cellOf(U3)}`)
check('U4 cell === · (unassigned)', cellOf(U4) === '·', `glyph=${cellOf(U4)}`)
console.log(`\n[gradebook] SUMMARY pass=${pass} fail=${fail} total=6`)
if (fail > 0) process.exit(1)
