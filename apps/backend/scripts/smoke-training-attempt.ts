#!/usr/bin/env bun
/* eslint-disable no-console */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseEnv } from './lib/env'
// oxlint-disable-next-line node/no-sync
const env = parseEnv(readFileSync(join(import.meta.dir, '..', '.env'), 'utf8'))
const url = env.CONVEX_SELF_HOSTED_URL ?? ''
const testSecret = env.TEST_SECRET ?? ''
if (!(url && testSecret)) {
  console.error('env missing')
  process.exit(2)
}
const probe = await fetch(`${url}/api/query`, {
  body: JSON.stringify({ args: { testSecret }, path: 'testing:countTestSuggestions' }),
  headers: { 'Content-Type': 'application/json' },
  method: 'POST'
})
const j = (await probe.json()) as { status: string; value?: { count: number; topicNames: string[] } }
if (j.status !== 'success' || !j.value || j.value.count === 0) {
  console.error('[attempt-smoke] FAIL no suggestions seeded — run smoke-training-gen first')
  process.exit(1)
}
console.log(`[attempt-smoke] suggestions present: ${j.value.count}, topics=${j.value.topicNames.join(', ')}`)
console.log('[attempt-smoke] OK seeded state ready for manual UI attempt flow')
