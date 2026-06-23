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
// oxlint-disable-next-line node/no-sync
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
console.log('[chunks] wipe + seed 5KB doc')
await c.mutation(api.testing.wipeDocs, { testSecret })
const body =
  'Engineering handbook. Code reviews required for every PR. CI gates merges. Deploys via main push. Quarterly reviews. On-call rotation weekly. Incident retro template. '.repeat(
    50
  )
const uploadUrl = await c.mutation(api.testing.docsGenerateUploadUrl, { testSecret })
const res = await fetch(uploadUrl, {
  body: new Blob([body]),
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
console.log(`[chunks] await embedding for ${docId} (text len=${body.length})`)
const deadline = Date.now() + 120_000
let row: null | { embedding?: number[] } = null
while (Date.now() < deadline) {
  row = await c.query(api.testing.getDocRow, { docId: docId as never, testSecret })
  if (row?.embedding && row.embedding.length > 0) break
  await sleep(3000)
}
check('doc embedding present', (row?.embedding?.length ?? 0) > 0, `dim=${row?.embedding?.length ?? 0}`)
check('doc embedding dim === 768', row?.embedding?.length === 768, `dim=${row?.embedding?.length ?? 0}`)
const counts = await c.query(api.testing.countChunksForDoc, { docId: docId as never, testSecret })
check('chunks > 1 for >2K text', counts.count > 1, `count=${counts.count}`)
check('first chunk starts at 0', counts.firstStart === 0, `firstStart=${counts.firstStart ?? '—'}`)
check('first chunk end <= 1600', (counts.firstEnd ?? 0) <= 1600, `firstEnd=${counts.firstEnd ?? '—'}`)
console.log(`\n[chunks] SUMMARY pass=${pass} fail=${fail} total=5`)
if (fail > 0) process.exit(1)
