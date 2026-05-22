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
let pass = 0
let fail = 0
const check = (label: string, ok: boolean, detail: string): void => {
  console.log(`${ok ? '✓' : '✗'} ${label}: ${detail}`)
  if (ok) pass += 1
  else fail += 1
}
await c.mutation(api.testing.wipeDocs, { testSecret })
const u = await c.mutation(api.testing.docsGenerateUploadUrl, { testSecret })
const warmRes = await fetch(u, {
  body: new Blob(['x']),
  headers: { 'Content-Type': 'application/octet-stream' },
  method: 'POST'
})
await warmRes.json()
const u2 = await c.mutation(api.testing.docsGenerateUploadUrl, { testSecret })
const res = await fetch(u2, {
  body: new Blob(['x']),
  headers: { 'Content-Type': 'application/octet-stream' },
  method: 'POST'
})
const { storageId } = (await res.json()) as { storageId: string }
const r = (await c.action(api.testing.docsFinalize, {
  filename: 'bad.bin',
  mime: 'application/octet-stream',
  scope: 'shared',
  storageId: storageId as never,
  testSecret,
  uploaderEmail: uploader
})) as { ok: boolean; reason?: string }
check(
  'unsupported mime → ok=false reason starts with unsupported-mime',
  !r.ok && (r.reason ?? '').startsWith('unsupported-mime:'),
  JSON.stringify(r)
)
console.log(`\n[unsupported-mime] SUMMARY pass=${pass} fail=${fail} total=1`)
if (fail > 0) process.exit(1)
