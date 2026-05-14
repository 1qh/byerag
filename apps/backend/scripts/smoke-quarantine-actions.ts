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
const uploader = (env.BOOTSTRAP_ADMIN_EMAIL ?? '').split(',')[0]?.trim() ?? ''
if (!(url && testSecret && uploader)) {
  console.error('env missing')
  process.exit(2)
}
const c = new ConvexHttpClient(url)
const sleep = async (ms: number): Promise<void> =>
  new Promise(r => {
    setTimeout(r, ms)
  })
let pass = 0
let fail = 0
const check = (label: string, ok: boolean, detail: string): void => {
  console.log(`${ok ? '✓' : '✗'} ${label}: ${detail}`)
  if (ok) pass += 1
  else fail += 1
}
const seedRejected = async (filename: string, body: string): Promise<string> => {
  const uploadUrl = await c.mutation(api.testing.docsGenerateUploadUrl, { testSecret })
  const res = await fetch(uploadUrl, { body: new Blob([body]), headers: { 'Content-Type': 'text/plain' }, method: 'POST' })
  const { storageId } = (await res.json()) as { storageId: string }
  const r = (await c.action(api.testing.docsFinalize, {
    filename,
    mime: 'text/plain',
    scope: 'shared',
    storageId: storageId as never,
    testSecret,
    uploaderEmail: uploader
  })) as { docId?: string }
  if (!r.docId) throw new Error('no docId')
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    const row = (await c.query(api.testing.getDocRow, { docId: r.docId as never, testSecret })) as null | {
      policyStatus?: string
    }
    if (row?.policyStatus === 'rejected') return r.docId
    if (row?.policyStatus === 'approved') throw new Error(`expected rejected got approved for ${filename}`)
    await sleep(2000)
  }
  throw new Error(`no classification for ${filename}`)
}
console.log('[quarantine-actions] wipe + seed 2 spam docs (both rejected by classifier)')
await c.mutation(api.testing.wipeDocs, { testSecret })
const a = await seedRejected('spam-a.txt', 'BUY NOW 90% off limited time email promo@spam.example')
const b = await seedRejected('spam-b.txt', 'CLICK HERE TODAY ONLY discount subscribe spam offer')
console.log('[quarantine-actions] approve A → policyStatus=approved + policyOverriddenBy=admin')
await c.mutation(api.testing.adminApproveReviewProbe, { adminEmail: uploader, docId: a as never, testSecret })
const aRow = (await c.query(api.testing.getDocRow, { docId: a as never, testSecret })) as null | {
  policyOverriddenBy?: string
  policyStatus?: string
}
check('A policyStatus=approved', aRow?.policyStatus === 'approved', `status=${aRow?.policyStatus}`)
check('A policyOverriddenBy=admin', aRow?.policyOverriddenBy === uploader, `by=${aRow?.policyOverriddenBy}`)
console.log('[quarantine-actions] confirm-reject B → blob purged + storageId=null')
await c.mutation(api.testing.adminConfirmRejectProbe, { adminEmail: uploader, docId: b as never, testSecret })
const bRow = (await c.query(api.testing.getDocRow, { docId: b as never, testSecret })) as null | {
  policyOverriddenBy?: string
  policyStatus?: string
  storageId?: string
}
check('B storageId cleared', !bRow?.storageId, `storageId=${bRow?.storageId ?? 'null'}`)
check('B policyStatus stays rejected', bRow?.policyStatus === 'rejected', `status=${bRow?.policyStatus}`)
check('B policyOverriddenBy=admin (audit)', bRow?.policyOverriddenBy === uploader, `by=${bRow?.policyOverriddenBy}`)
console.log(`\n[quarantine-actions] SUMMARY pass=${pass} fail=${fail} total=5`)
if (fail > 0) process.exit(1)
