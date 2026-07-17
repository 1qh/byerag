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
const ts = env.TEST_SECRET ?? ''
if (!(url && ts)) {
  console.error('env missing')
  process.exit(1)
}
const c = new ConvexHttpClient(url)
const r = await c.mutation(api.testing.rebillCostRecords, { testSecret: ts })
console.log(`rebilled ${r.patched} / ${r.scanned} cost record(s); cents drift = ${r.centsDelta}`)
