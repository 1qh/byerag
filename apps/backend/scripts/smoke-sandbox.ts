#!/usr/bin/env bun
/* eslint-disable no-console, no-await-in-loop */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential poll by design */
import { ConvexHttpClient } from 'convex/browser'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { api } from '../convex/_generated/api'
import { parseEnv } from './lib/env'
// oxlint-disable-next-line node/no-sync
const env = parseEnv(readFileSync(join(import.meta.dir, '..', '.env'), 'utf8'))
const url = env.CONVEX_SELF_HOSTED_URL ?? ''
const testSecret = env.TEST_SECRET ?? ''
const bootstrapEmail = (env.BOOTSTRAP_ADMIN_EMAIL ?? '').split(',')[0]?.trim() ?? ''
const die = (msg: string): never => {
  console.error(msg)
  process.exit(2)
}
if (!url) die('CONVEX_SELF_HOSTED_URL missing')
if (!testSecret) die('TEST_SECRET missing')
if (!bootstrapEmail) die('BOOTSTRAP_ADMIN_EMAIL missing')
const sleep = async (ms: number): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, ms)
  })
const DEADLINE_MS = 120_000
const POLL_MS = 1500
const client = new ConvexHttpClient(url)
console.log(`[smoke-sandbox] target=${url} email=${bootstrapEmail}`)
const chatId = await client.mutation(api.testing.send, {
  app: 'user',
  content: 'smoke test: list available tools and respond ok',
  email: bootstrapEmail,
  testSecret
})
console.log(`[smoke-sandbox] chat created chatId=${chatId}`)
const deadline = Date.now() + DEADLINE_MS
let events: { content: string; seq: number }[] = []
while (Date.now() < deadline) {
  events = await client.query(api.testing.listStreamEvents, { chatId, testSecret })
  if (events.length > 0) break
  await sleep(POLL_MS)
}
if (events.length === 0) {
  console.error(`[smoke-sandbox] FAIL no streamEvents after ${DEADLINE_MS}ms`)
  process.exit(1)
}
console.log(`[smoke-sandbox] OK events=${events.length} firstSeq=${events[0]?.seq}`)
console.log(`[smoke-sandbox] firstEventExcerpt=${(events[0]?.content ?? '').slice(0, 200)}`)
