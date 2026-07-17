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
await c.mutation(api.testing.wipeTrainingTables, { testSecret })
const topicId = await c.mutation(api.testing.seedTopicWithPool, {
  name: 'BatchTopic',
  poolSize: 5,
  testSecret
})
const seedSugWithKind = async (kind: 'new' | 'retire'): Promise<string> =>
  c.mutation(api.testing.seedSuggestionWithKind, { kind, testSecret, topicId: topicId as never })
const newId = await seedSugWithKind('new')
const retireId = await seedSugWithKind('retire')
const r1 = (await c.query(api.training.inferBatchSubstantive, { suggestionIds: [newId as never] })) as string
check('only-new → cosmetic', r1 === 'cosmetic', `r=${r1}`)
const r3 = (await c.query(api.training.inferBatchSubstantive, {
  suggestionIds: [retireId as never, newId as never]
})) as string
check('has-retire → substantive (overrides new)', r3 === 'substantive', `r=${r3}`)
console.log(`\n[batch-substantive] SUMMARY pass=${pass} fail=${fail} total=2`)
if (fail > 0) process.exit(1)
