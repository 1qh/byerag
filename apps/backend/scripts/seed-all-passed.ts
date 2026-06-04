#!/usr/bin/env bun
/* eslint-disable no-console, no-await-in-loop */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential script ops */
/** oxlint-disable unicorn/no-process-exit */
import { ConvexHttpClient } from 'convex/browser'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { api } from '../convex/_generated/api'

const ENV_LINE = /^\s*(?<key>[A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?<val>.*?)\s*$/u
const parseEnv = (text: string): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const m = ENV_LINE.exec(line)
    if (m?.groups?.key) out[m.groups.key] = (m.groups.val ?? '').replaceAll(/^["']|["']$/gu, '')
  }
  return out
}
const env = parseEnv(readFileSync(join(import.meta.dir, '..', '.env'), 'utf8'))
const url = env.CONVEX_SELF_HOSTED_URL ?? ''
const ts = env.TEST_SECRET ?? ''
if (!(url && ts)) {
  console.error('env missing')
  process.exit(1)
}
const c = new ConvexHttpClient(url)
const userId = process.argv[2] ?? 'all-passed@example.com'
const list: { _id: string; name: string }[] = await c.query(api.testing.listTopicsForTest, { testSecret: ts })
console.log(`${list.length} topics`)
for (const t of list) {
  await c.mutation(api.testing.seedAssignment, { createdBy: 'test', testSecret: ts, topicId: t._id as never, userId })
  await c.mutation(api.testing.seedTestPass, { kind: 'assigned', testSecret: ts, topicId: t._id as never, userId })
  console.log(`assigned + passed: ${t.name}`)
}
console.log('done')
