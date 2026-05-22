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
const bootstrapEmail = (env.BOOTSTRAP_ADMIN_EMAIL ?? '').split(',')[0]?.trim() ?? ''
const die = (msg: string): never => {
  console.error(msg)
  process.exit(2)
}
if (!url) die('CONVEX_SELF_HOSTED_URL missing')
if (!testSecret) die('TEST_SECRET missing')
if (!bootstrapEmail) die('BOOTSTRAP_ADMIN_EMAIL missing')
const sleep = async (ms: number): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, ms)
  })
const c = new ConvexHttpClient(url)
console.log('[gen-smoke] wiping docs')
await c.mutation(api.testing.wipeDocs, { testSecret })
const seedBody = `Security Policy v2 (2026)
Section 1: All employee laptops must be encrypted with FileVault (macOS) or BitLocker (Windows).
Section 2: Password manager (1Password company plan) is mandatory for any SaaS credential storage.
Section 3: MFA via TOTP or hardware key is required for every external service.
Section 4: Quarterly access review by team lead; revoke unused accounts within 14 days.
Section 5: Incident response: report any suspected compromise to security@company within 1 hour.
`
console.log('[gen-smoke] seeding shared doc')
const uploadUrl = await c.mutation(api.testing.docsGenerateUploadUrl, { testSecret })
const upload = await fetch(uploadUrl, {
  body: new Blob([seedBody], { type: 'text/plain' }),
  headers: { 'Content-Type': 'text/plain' },
  method: 'POST'
})
const { storageId } = (await upload.json()) as { storageId: string }
const result = (await c.action(api.testing.docsFinalize, {
  filename: 'security-policy-v2.txt',
  mime: 'text/plain',
  scope: 'shared',
  storageId: storageId as never,
  testSecret,
  uploaderEmail: bootstrapEmail
})) as { docId?: string; ok: boolean }
if (!(result.ok && result.docId)) die(`finalize failed: ${JSON.stringify(result)}`)
console.log(`[gen-smoke] docId=${result.docId} — waiting for generation pipeline`)
const deadline = Date.now() + 120_000
const TS = testSecret
let suggestionsCount = 0
while (Date.now() < deadline) {
  const res = await fetch(`${url}/api/query`, {
    body: JSON.stringify({ args: { testSecret: TS }, path: 'testing:countTestSuggestions' }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST'
  })
  if (res.ok) {
    const j = (await res.json()) as { status: string; value?: { count: number } }
    if (j.status === 'success' && j.value && j.value.count > 0) {
      suggestionsCount = j.value.count
      break
    }
  }
  await sleep(3000)
}
console.log(`[gen-smoke] suggestions captured=${suggestionsCount}`)
if (suggestionsCount === 0) {
  console.error('[gen-smoke] FAIL no suggestions generated within 120s')
  process.exit(1)
}
console.log('[gen-smoke] OK generation pipeline working end-to-end')
