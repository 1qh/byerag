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
const env = parseEnv(readFileSync(join(import.meta.dir, '..', '.env'), 'utf8'))
const url = env.CONVEX_SELF_HOSTED_URL ?? ''
const testSecret = env.TEST_SECRET ?? ''
const uploader = (env.BOOTSTRAP_ADMIN_EMAIL ?? '').split(',')[0]?.trim() ?? ''
if (!(url && testSecret && uploader)) {
  console.error('env missing')
  process.exit(2)
}
const c = new ConvexHttpClient(url)
const FILENAME = 'notes.txt'
let pass = 0
let fail = 0
const check = (label: string, ok: boolean, detail: string): void => {
  console.log(`${ok ? '✓' : '✗'} ${label}: ${detail}`)
  if (ok) pass += 1
  else fail += 1
}
const upload = async (body: string, keepBoth?: boolean): Promise<{ docId?: string; ok: boolean; reason?: string }> => {
  const uploadUrl = await c.mutation(api.testing.docsGenerateUploadUrl, { testSecret })
  const res = await fetch(uploadUrl, { body: new Blob([body]), headers: { 'Content-Type': 'text/plain' }, method: 'POST' })
  const { storageId } = (await res.json()) as { storageId: string }
  return (await c.action(api.testing.docsFinalize, {
    filename: FILENAME,
    keepBoth,
    mime: 'text/plain',
    scope: 'mine',
    storageId: storageId as never,
    testSecret,
    uploaderEmail: uploader
  })) as { docId?: string; ok: boolean; reason?: string }
}
console.log('[keep-both] wipe docs')
await c.mutation(api.testing.wipeDocs, { testSecret })
console.log('[keep-both] upload v1')
const v1 = await upload('Original notes.')
check('v1 ok', v1.ok, `docId=${v1.docId ?? '—'}`)
console.log('[keep-both] upload same filename + keepBoth=true')
const v2 = await upload('Different notes.', true)
check('v2 ok via keepBoth path', v2.ok, `docId=${v2.docId ?? '—'} reason=${v2.reason ?? '—'}`)
const v2Row = (await c.query(api.testing.getDocRow, { docId: v2.docId as never, testSecret })) as null | {
  filename: string
  supersedes?: string
  version: number
}
check('v2 filename === "notes (2).txt"', v2Row?.filename === 'notes (2).txt', `filename=${v2Row?.filename ?? '—'}`)
check(
  'v2 supersedes === null (independent row)',
  v2Row?.supersedes === undefined,
  `supersedes=${v2Row?.supersedes ?? 'null'}`
)
check('v2 version === 1 (independent row)', v2Row?.version === 1, `version=${v2Row?.version ?? '—'}`)
const v1Row = (await c.query(api.testing.getDocRow, { docId: v1.docId as never, testSecret })) as null | {
  deletedAt?: number
  supersededBy?: string
}
check('v1 untouched (no supersededBy)', v1Row?.supersededBy === undefined, `supersededBy=${v1Row?.supersededBy ?? 'null'}`)
check('v1 untouched (no deletedAt)', v1Row?.deletedAt === undefined, `deletedAt=${v1Row?.deletedAt ?? 'null'}`)
console.log('[keep-both] third upload with keepBoth → expect "notes (3).txt"')
const v3 = await upload('Third notes.', true)
const v3Row = (await c.query(api.testing.getDocRow, { docId: v3.docId as never, testSecret })) as null | {
  filename: string
}
check('v3 filename === "notes (3).txt"', v3Row?.filename === 'notes (3).txt', `filename=${v3Row?.filename ?? '—'}`)
console.log(`\n[keep-both] SUMMARY pass=${pass} fail=${fail} total=7`)
if (fail > 0) process.exit(1)
