#!/usr/bin/env bun
/* eslint-disable no-console */
import { ConvexHttpClient } from 'convex/browser'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { api } from '../convex/_generated/api'
import { parseEnv } from './lib/env'
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
let pass = 0
let fail = 0
const check = (label: string, ok: boolean, detail: string): void => {
  console.log(`${ok ? '✓' : '✗'} ${label}: ${detail}`)
  if (ok) pass += 1
  else fail += 1
}
console.log('[zip-bomb] wipe + craft 100MB-of-zeros gzipped (~100KB) bomb')
await c.mutation(api.testing.wipeDocs, { testSecret })
const raw = new Uint8Array(100 * 1024 * 1024)
// oxlint-disable-next-line node/no-sync
const gz = gzipSync(raw)
console.log(`[zip-bomb] gzipped size=${gz.byteLength} bytes (decompresses to ${raw.byteLength})`)
const uploadUrl = await c.mutation(api.testing.docsGenerateUploadUrl, { testSecret })
const res = await fetch(uploadUrl, {
  body: new Blob([gz]),
  headers: { 'Content-Type': 'application/gzip' },
  method: 'POST'
})
const { storageId } = (await res.json()) as { storageId: string }
const fin = (await c.action(api.testing.docsFinalize, {
  filename: 'bomb.gz',
  mime: 'application/gzip',
  scope: 'shared',
  storageId: storageId as never,
  testSecret,
  uploaderEmail: uploader
})) as { docId?: string; ok: boolean; reason?: string; signature?: string }
check(
  'zip-bomb quarantined OR rejected by scan',
  !fin.ok,
  `ok=${fin.ok} reason=${fin.reason ?? '—'} signature=${fin.signature ?? '—'}`
)
console.log(`\n[zip-bomb] SUMMARY pass=${pass} fail=${fail} total=1`)
if (fail > 0) process.exit(1)
