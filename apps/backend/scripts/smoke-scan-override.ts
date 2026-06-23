#!/usr/bin/env bun
/* eslint-disable no-console */
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
const adminEmail = (env.BOOTSTRAP_ADMIN_EMAIL ?? '').split(',')[0]?.trim() ?? ''
if (!(url && testSecret && adminEmail)) {
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
console.log('[scan-override] wipe docs')
await c.mutation(api.testing.wipeDocs, { testSecret })
console.log('[scan-override] upload EICAR-shaped body')
const uploadUrl = await c.mutation(api.testing.docsGenerateUploadUrl, { testSecret })
const res = await fetch(uploadUrl, {
  body: new Blob([EICAR], { type: 'text/plain' }),
  headers: { 'Content-Type': 'text/plain' },
  method: 'POST'
})
if (!res.ok) throw new Error(`storage ${res.status}`)
const { storageId } = (await res.json()) as { storageId: string }
const fin = (await c.action(api.testing.docsFinalize, {
  filename: 'evil.txt',
  mime: 'text/plain',
  scope: 'shared',
  storageId: storageId as never,
  testSecret,
  uploaderEmail: adminEmail
})) as { docId?: string; ok: boolean; reason?: string; signature?: string }
check(
  'upload returns quarantined',
  !fin.ok && fin.reason === 'quarantined',
  `reason=${fin.reason ?? '—'} signature=${fin.signature ?? '—'}`
)
if (!fin.docId) {
  console.error('no docId')
  process.exit(1)
}
const { docId } = fin
const rowBefore = (await c.query(api.testing.getDocRow, { docId: docId as never, testSecret })) as null | {
  scanOverriddenBy?: string
  scanStatus: string
  storageId?: string
}
check('quarantined row preserves storageId', Boolean(rowBefore?.storageId), `storageId=${rowBefore?.storageId ?? '—'}`)
check('row scanStatus=quarantined', rowBefore?.scanStatus === 'quarantined', `scanStatus=${rowBefore?.scanStatus ?? '—'}`)
console.log('[scan-override] apply admin scan override')
await c.mutation(api.testing.scanOverrideProbe, { adminEmail, docId: docId as never, testSecret })
const rowAfter = (await c.query(api.testing.getDocRow, { docId: docId as never, testSecret })) as null | {
  scanOverriddenAt?: number
  scanOverriddenBy?: string
  scanStatus: string
}
check('row scanStatus=clean after override', rowAfter?.scanStatus === 'clean', `scanStatus=${rowAfter?.scanStatus ?? '—'}`)
check(
  'row scanOverriddenBy=admin',
  rowAfter?.scanOverriddenBy === adminEmail,
  `scanOverriddenBy=${rowAfter?.scanOverriddenBy ?? '—'}`
)
check(
  'row scanOverriddenAt set',
  typeof rowAfter?.scanOverriddenAt === 'number',
  `scanOverriddenAt=${rowAfter?.scanOverriddenAt ?? '—'}`
)
const audit = await c.query(api.testing.countAuditLogs, { testSecret })
check(
  'audit has docs.scanOverride row',
  audit.sampleCommands.includes('docs.scanOverride'),
  `sample=${audit.sampleCommands.join(',')}`
)
console.log(`\n[scan-override] SUMMARY pass=${pass} fail=${fail} total=7`)
if (fail > 0) process.exit(1)
