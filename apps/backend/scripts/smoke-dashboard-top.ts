#!/usr/bin/env bun
/* eslint-disable no-console, no-await-in-loop */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential by design */
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
const uploader = (env.BOOTSTRAP_ADMIN_EMAIL ?? '').split(',')[0]?.trim() ?? ''
if (!(url && testSecret && uploader)) {
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
console.log('[dashboard-top] wipe + seed 3 users + 2 shared docs + 2 cost rows')
await c.mutation(api.testing.wipeUserProfiles, { testSecret })
await c.mutation(api.testing.wipeDocs, { testSecret })
await c.mutation(api.testing.wipeCostRecords, { testSecret })
await c.mutation(api.testing.seedUserProfile, { role: 'user', testSecret, userId: 'u1@example.com' })
await c.mutation(api.testing.seedUserProfile, { role: 'user', testSecret, userId: 'u2@example.com' })
await c.mutation(api.testing.seedUserProfile, { role: 'user', testSecret, userId: 'u3@example.com' })
await c.mutation(api.testing.seedUserProfile, { role: 'admin', testSecret, userId: 'admin@example.com' })
for (const i of [1, 2])
  await c.mutation(api.testing.seedApprovedSharedDoc, {
    filename: `doc-${i}.txt`,
    testSecret,
    uploaderEmail: uploader
  })
const today = new Date().toISOString().slice(0, 10)
await c.mutation(api.testing.seedCostRecord, {
  cents: 250,
  dayKey: today,
  model: 'kimi-for-coding',
  owner: 'u1@example.com',
  testSecret
})
await c.mutation(api.testing.seedCostRecord, {
  cents: 175,
  dayKey: today,
  model: 'kimi-for-coding',
  owner: 'u2@example.com',
  testSecret
})
const top = await c.query(api.testing.topStripProbe, { testSecret })
check('totalUsers === 3', top.totalUsers === 3, `totalUsers=${top.totalUsers}`)
check('docsInCorpus === 2', top.docsInCorpus === 2, `docsInCorpus=${top.docsInCorpus}`)
check('cycleCents === 425', top.cycleCents === 425, `cycleCents=${top.cycleCents}`)
console.log(`\n[dashboard-top] SUMMARY pass=${pass} fail=${fail} total=3`)
if (fail > 0) process.exit(1)
