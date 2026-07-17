#!/usr/bin/env bun
/* eslint-disable no-console, no-await-in-loop */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential script ops */
import { ConvexHttpClient } from 'convex/browser'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { api } from '../convex/_generated/api'
import { parseEnv } from './lib/env'
// oxlint-disable-next-line node/no-sync
const env = parseEnv(readFileSync(join(import.meta.dir, '..', '.env'), 'utf8'))
const url = env.CONVEX_SELF_HOSTED_URL ?? ''
const ts = env.TEST_SECRET ?? ''
if (!(url && ts)) {
  console.error('env missing')
  process.exit(1)
}
const TEST_PATTERNS = ['@example.com', '@user.test', '@example.org', '@test.com', 'gdpr-admin@', 'perf-test', 'proxy-test']
const c = new ConvexHttpClient(url)
const users = await c.query(api.testing.listProfilesForTest, { testSecret: ts })
const tagged: { kind: 'real' | 'test'; userId: string }[] = []
for (const u of users) {
  const lower = u.userId.toLowerCase()
  const isTest = TEST_PATTERNS.some(p => lower.includes(p))
  const kind: 'real' | 'test' = isTest ? 'test' : 'real'
  if (u.kind !== kind) {
    await c.mutation(api.testing.markProfileKind, { kind, testSecret: ts, userId: u.userId })
    tagged.push({ kind, userId: u.userId })
  }
}
console.log(`tagged ${tagged.length} profile(s):`)
for (const t of tagged) console.log(`  ${t.kind === 'test' ? '[test]' : '[real]'} ${t.userId}`)
