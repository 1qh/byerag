#!/usr/bin/env bun
/* eslint-disable no-console, @typescript-eslint/no-unnecessary-condition */
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
let pass = 0
let fail = 0
const check = (label: string, ok: boolean, detail: string): void => {
  console.log(`${ok ? '✓' : '✗'} ${label}: ${detail}`)
  if (ok) pass += 1
  else fail += 1
}
const upload = async (filename: string, body: string, replace?: boolean): Promise<string> => {
  const u = await c.mutation(api.testing.docsGenerateUploadUrl, { testSecret })
  const res = await fetch(u, { body: new Blob([body]), headers: { 'Content-Type': 'text/plain' }, method: 'POST' })
  const { storageId } = (await res.json()) as { storageId: string }
  const r = (await c.action(api.testing.docsFinalize, {
    filename,
    mime: 'text/plain',
    replace,
    scope: 'shared',
    storageId: storageId as never,
    testSecret,
    uploaderEmail: uploader
  })) as { docId?: string }
  if (!r.docId) throw new Error('no docId')
  return r.docId
}
console.log('[citation-badge] wipe + seed v1 fresh')
await c.mutation(api.testing.wipeDocs, { testSecret })
const v1 = await upload('policy.txt', 'Policy v1: PTO = 15 days.')
const b1 = (await c.query(api.docs.getCitationBadge, { docId: v1 as never })) as null | { badge: string; version: number }
check('v1 fresh', b1?.badge === 'fresh' && b1?.version === 1, `badge=${b1?.badge} version=${b1?.version}`)
console.log('[citation-badge] upload v2 (replace) — v1 becomes superseded')
const v2 = await upload('policy.txt', 'Policy v2: PTO = 20 days.', true)
const b1after = (await c.query(api.docs.getCitationBadge, { docId: v1 as never })) as null | { badge: string }
const b2 = (await c.query(api.docs.getCitationBadge, { docId: v2 as never })) as null | { badge: string; version: number }
check('v1 now superseded (deletedAt set → badge=deleted)', b1after?.badge === 'deleted', `badge=${b1after?.badge}`)
check('v2 fresh version=2', b2?.badge === 'fresh' && b2?.version === 2, `badge=${b2?.badge} version=${b2?.version}`)
console.log(`\n[citation-badge] SUMMARY pass=${pass} fail=${fail} total=3`)
if (fail > 0) process.exit(1)
