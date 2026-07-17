#!/usr/bin/env bun
/* eslint-disable no-console, no-await-in-loop */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential script ops */
/** oxlint-disable unicorn/no-process-exit */
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
