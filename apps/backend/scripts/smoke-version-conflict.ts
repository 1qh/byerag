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
if (!(url && testSecret)) {
  console.error('env missing')
  process.exit(2)
}
const c = new ConvexHttpClient(url)
const OWNER = 'version-test@example.com'
const FILENAME = 'policy.txt'
const upload = async (
  body: string,
  replace?: boolean
): Promise<{ docId?: string; filenameConflict?: { existingId: string }; ok: boolean; reason?: string }> => {
  const uploadUrl = await c.mutation(api.testing.docsGenerateUploadUrl, { testSecret })
  const res = await fetch(uploadUrl, { body: new Blob([body]), headers: { 'Content-Type': 'text/plain' }, method: 'POST' })
  if (!res.ok) throw new Error(`storage upload ${res.status}`)
  const { storageId } = (await res.json()) as { storageId: string }
  return (await c.action(api.testing.docsFinalize, {
    filename: FILENAME,
    mime: 'text/plain',
    replace,
    scope: 'mine',
    storageId: storageId as never,
    testSecret,
    uploaderEmail: OWNER
  })) as { docId?: string; filenameConflict?: { existingId: string }; ok: boolean; reason?: string }
}
console.log('[version-conflict] wiping docs')
await c.mutation(api.testing.wipeDocs, { testSecret })
let pass = 0
let fail = 0
const check = (label: string, ok: boolean, detail: string): void => {
  console.log(`${ok ? '✓' : '✗'} ${label}: ${detail}`)
  if (ok) pass += 1
  else fail += 1
}
console.log('[version-conflict] step 1: upload v1')
const v1 = await upload('Policy v1: PTO = 15 days.')
check('v1 ok', v1.ok && Boolean(v1.docId), `reason=${v1.reason ?? '—'} docId=${v1.docId ?? '—'}`)
const v1Id = v1.docId
if (!v1Id) {
  console.error('no v1 docId')
  process.exit(1)
}
console.log('[version-conflict] step 2: upload same filename + different content WITHOUT replace')
const v2NoReplace = await upload('Policy v2: PTO = 20 days.')
check(
  'v2-no-replace returns filename-conflict',
  !v2NoReplace.ok && v2NoReplace.reason === 'filename-conflict',
  `reason=${v2NoReplace.reason ?? '—'}`
)
check(
  'v2-no-replace surfaces existingId',
  v2NoReplace.filenameConflict?.existingId === v1Id,
  `existingId=${v2NoReplace.filenameConflict?.existingId ?? '—'} vs v1Id=${v1Id}`
)
console.log('[version-conflict] step 3: retry with replace=true')
const v2Replace = await upload('Policy v2: PTO = 20 days.', true)
check(
  'v2-replace ok',
  v2Replace.ok && Boolean(v2Replace.docId),
  `reason=${v2Replace.reason ?? '—'} docId=${v2Replace.docId ?? '—'}`
)
const v2Id = v2Replace.docId
if (!v2Id) {
  console.error('no v2 docId')
  process.exit(1)
}
const v1Row = (await c.query(api.testing.getDocRow, { docId: v1Id as never, testSecret })) as null | {
  deletedAt?: number
  supersededBy?: string
  version: number
}
const v2Row = (await c.query(api.testing.getDocRow, { docId: v2Id as never, testSecret })) as null | {
  supersedes?: string
  version: number
}
check('v2 row version === 2', v2Row?.version === 2, `version=${v2Row?.version ?? '—'}`)
check('v2 row supersedes === v1Id', v2Row?.supersedes === v1Id, `supersedes=${v2Row?.supersedes ?? '—'}`)
check('v1 row supersededBy === v2Id', v1Row?.supersededBy === v2Id, `supersededBy=${v1Row?.supersededBy ?? '—'}`)
check(
  'v1 row deletedAt set',
  typeof v1Row?.deletedAt === 'number' && (v1Row.deletedAt ?? 0) > 0,
  `deletedAt=${v1Row?.deletedAt ?? 'null'}`
)
console.log(`\n[version-conflict] SUMMARY pass=${pass} fail=${fail} total=7`)
if (fail > 0) process.exit(1)
