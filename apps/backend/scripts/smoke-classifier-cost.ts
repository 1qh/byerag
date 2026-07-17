#!/usr/bin/env bun
/* eslint-disable no-console, no-await-in-loop */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential by design */
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
const sleep = async (ms: number): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, ms)
  })
let pass = 0
let fail = 0
const check = (label: string, ok: boolean, detail: string): void => {
  console.log(`${ok ? '✓' : '✗'} ${label}: ${detail}`)
  if (ok) pass += 1
  else fail += 1
}
const OWNER = `clf-cost-${Date.now()}@example.com`
console.log(`[clf-cost] wipe owner spend for ${OWNER}`)
await c.mutation(api.testing.wipeAllForOwner, { email: OWNER, testSecret })
await c.mutation(api.testing.wipeDocs, { testSecret })
console.log('[clf-cost] upload on-topic doc')
const uploadUrl = await c.mutation(api.testing.docsGenerateUploadUrl, { testSecret })
const res = await fetch(uploadUrl, {
  body: new Blob(['Engineering handbook. Code reviews required for every PR. CI gates merges. Deploys via main push.']),
  headers: { 'Content-Type': 'text/plain' },
  method: 'POST'
})
const { storageId } = (await res.json()) as { storageId: string }
const fin = (await c.action(api.testing.docsFinalize, {
  filename: 'handbook.txt',
  mime: 'text/plain',
  scope: 'shared',
  storageId: storageId as never,
  testSecret,
  uploaderEmail: OWNER
})) as { docId?: string }
if (!fin.docId) {
  console.error('no docId')
  process.exit(1)
}
const { docId } = fin
console.log(`[clf-cost] await classifier finish for ${docId}`)
const deadline = Date.now() + 90_000
while (Date.now() < deadline) {
  const row = (await c.query(api.testing.getDocRow, { docId: docId as never, testSecret })) as null | {
    policyStatus?: string
  }
  if (row?.policyStatus === 'approved' || row?.policyStatus === 'rejected') break
  await sleep(2000)
}
const spend = (await c.query(api.testing.countOwnerSpend, { testSecret })) as { totalCents: number }
check('ownerSpend has 1c after classifier call', spend.totalCents >= 1, `totalCents=${spend.totalCents}`)
console.log(`\n[clf-cost] SUMMARY pass=${pass} fail=${fail} total=1`)
if (fail > 0) process.exit(1)
