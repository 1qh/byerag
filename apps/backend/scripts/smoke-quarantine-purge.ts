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
const EICAR = String.raw`X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*`
let pass = 0
let fail = 0
const check = (label: string, ok: boolean, detail: string): void => {
  console.log(`${ok ? '✓' : '✗'} ${label}: ${detail}`)
  if (ok) pass += 1
  else fail += 1
}
console.log('[quarantine-purge] wipe docs + upload EICAR')
await c.mutation(api.testing.wipeDocs, { testSecret })
const uploadUrl = await c.mutation(api.testing.docsGenerateUploadUrl, { testSecret })
const res = await fetch(uploadUrl, { body: new Blob([EICAR]), headers: { 'Content-Type': 'text/plain' }, method: 'POST' })
const { storageId } = (await res.json()) as { storageId: string }
const fin = (await c.action(api.testing.docsFinalize, {
  filename: 'evil.txt',
  mime: 'text/plain',
  scope: 'shared',
  storageId: storageId as never,
  testSecret,
  uploaderEmail: uploader
})) as { docId?: string; ok: boolean }
if (!fin.docId) {
  console.error('no docId')
  process.exit(1)
}
const { docId } = fin
const rowBefore = (await c.query(api.testing.getDocRow, { docId: docId as never, testSecret })) as null | {
  scanStatus: string
  storageId?: string
}
check('quarantined row has storageId', Boolean(rowBefore?.storageId), `storageId=${rowBefore?.storageId ?? '—'}`)
console.log('[quarantine-purge] run cron — should NOT purge (uploadedAt < 1h)')
const r1 = await c.action(api.testing.runQuarantinePurge, { testSecret })
check(
  'first cron skips fresh row',
  r1.blobsPurged === 0 && r1.rowsTouched === 0,
  `blobs=${r1.blobsPurged} rows=${r1.rowsTouched}`
)
console.log('[quarantine-purge] age row by 2h')
await c.mutation(api.testing.ageQuarantineRow, { ageMs: 7_200_000, docId: docId as never, testSecret })
console.log('[quarantine-purge] run cron — should purge')
const r2 = await c.action(api.testing.runQuarantinePurge, { testSecret })
check(
  'second cron purges aged row',
  r2.blobsPurged === 1 && r2.rowsTouched === 1,
  `blobs=${r2.blobsPurged} rows=${r2.rowsTouched}`
)
const rowAfter = (await c.query(api.testing.getDocRow, { docId: docId as never, testSecret })) as null | {
  scanCancelledAt?: number
  scanStatus: string
  storageId?: string
}
check('storageId cleared after purge', !rowAfter?.storageId, `storageId=${rowAfter?.storageId ?? 'null'}`)
check(
  'scanCancelledAt set',
  typeof rowAfter?.scanCancelledAt === 'number',
  `scanCancelledAt=${rowAfter?.scanCancelledAt ?? '—'}`
)
check(
  'row preserved for audit (scanStatus still quarantined)',
  rowAfter?.scanStatus === 'quarantined',
  `scanStatus=${rowAfter?.scanStatus ?? '—'}`
)
console.log('[quarantine-purge] third cron — idempotent (no rows left)')
const r3 = await c.action(api.testing.runQuarantinePurge, { testSecret })
check('third cron no-op', r3.blobsPurged === 0 && r3.rowsTouched === 0, `blobs=${r3.blobsPurged} rows=${r3.rowsTouched}`)
console.log(`\n[quarantine-purge] SUMMARY pass=${pass} fail=${fail} total=6`)
if (fail > 0) process.exit(1)
