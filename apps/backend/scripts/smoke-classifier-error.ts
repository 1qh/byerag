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
console.log('[classifier-error] wipe + seed doc')
await c.mutation(api.testing.wipeDocs, { testSecret })
const uploadUrl = await c.mutation(api.testing.docsGenerateUploadUrl, { testSecret })
const res = await fetch(uploadUrl, {
  body: new Blob(['Generic engineering handbook content.\n- code review required\n- CI gates merges\n']),
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
  uploaderEmail: uploader
})) as { docId?: string }
if (!fin.docId) {
  console.error('no docId')
  process.exit(1)
}
const { docId } = fin
console.log(`[classifier-error] await initial extraction+classify for ${docId}`)
const deadline = Date.now() + 60_000
while (Date.now() < deadline) {
  const row = (await c.query(api.testing.getDocRow, { docId: docId as never, testSecret })) as null | {
    policyStatus?: string
  }
  if (row?.policyStatus === 'approved' || row?.policyStatus === 'rejected') break
  await sleep(2000)
}
console.log('[classifier-error] reset policy to pending')
await c.mutation(api.testing.resetPolicyPending, { docId: docId as never, testSecret })
const r1 = await c.action(api.testingNode.classifyProbeError, { docId: docId as never, testSecret })
check(
  'first invocation schedules retry',
  !r1.classified && (r1.reason ?? '').startsWith('kimi-error-retry-scheduled'),
  `reason=${r1.reason ?? '—'}`
)
console.log('[classifier-error] wait for scheduled retry (1s + slack)')
await sleep(2500)
const rowAfter = (await c.query(api.testing.getDocRow, { docId: docId as never, testSecret })) as null | {
  policyReason?: string
  policyStatus?: string
}
check(
  'policyStatus still pending after final failure',
  rowAfter?.policyStatus === 'pending',
  `status=${rowAfter?.policyStatus ?? '—'}`
)
check(
  'policyReason marks classifier-error',
  (rowAfter?.policyReason ?? '').startsWith('classifier-error:'),
  `reason=${rowAfter?.policyReason ?? '—'}`
)
const audit = (await c.query(api.testing.countAuditLogs, { testSecret })) as { sampleCommands: string[] }
check(
  'audit has docs.classifierError row',
  audit.sampleCommands.includes('docs.classifierError'),
  `sample=${audit.sampleCommands.join(',')}`
)
console.log(`\n[classifier-error] SUMMARY pass=${pass} fail=${fail} total=4`)
if (fail > 0) process.exit(1)
