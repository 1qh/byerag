#!/usr/bin/env bun
/* eslint-disable @typescript-eslint/max-params, @typescript-eslint/no-shadow, @typescript-eslint/no-deprecated, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/use-unknown-in-catch-callback-variable, no-await-in-loop, no-continue, no-shadow, no-useless-assignment, unicorn/prefer-ternary, unicorn/no-new-array, unicorn/prefer-array-find */
/** biome-ignore-all lint/nursery/noContinue: control flow shape */
/** biome-ignore-all lint/nursery/noShadow: scoped shadows ok */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential by design */
/** biome-ignore-all lint/performance/useTopLevelRegex: scoped regex ok */
/** biome-ignore-all lint/style/useExplicitLengthCheck: idiomatic */
/** biome-ignore-all lint/correctness/noUnusedVariables: pending feature */
/* eslint-disable no-console */
/** biome-ignore-all lint/style/noProcessEnv: smoke reads .env directly */
/** biome-ignore-all lint/nursery/noUndeclaredEnvVars: smoke env */
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
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
const die = (msg: string): never => {
  console.error(msg)
  process.exit(2)
}
if (!url) die('CONVEX_SELF_HOSTED_URL missing')
if (!testSecret) die('TEST_SECRET missing')
if (!uploader) die('BOOTSTRAP_ADMIN_EMAIL missing')
const client = new ConvexHttpClient(url)
const uploadBytes = async (label: string, bytes: Uint8Array, filename: string, mime: string) => {
  const uploadUrl = await client.mutation(api.testing.docsGenerateUploadUrl, { testSecret })
  const res = await fetch(uploadUrl, { body: bytes, headers: { 'Content-Type': mime }, method: 'POST' })
  if (!res.ok) die(`[${label}] storage upload failed: ${res.status}`)
  const { storageId } = (await res.json()) as { storageId: string }
  const result = await client.action(api.testing.docsFinalize, {
    filename,
    mime,
    scope: 'shared',
    storageId,
    testSecret,
    uploaderEmail: uploader
  })
  console.log(`[${label}] result=${JSON.stringify(result)}`)
  return result
}
const EICAR = String.raw`X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*`
const wipeCount = await client.mutation(api.testing.wipeDocs, { testSecret })
console.log(`[wipe] removed ${wipeCount} docs rows`)
const runId = Date.now().toString()
const cleanBytes = new TextEncoder().encode(`smoke-doc-${runId} clean test content`)
const eicarBytes = new TextEncoder().encode(EICAR)
const r1 = await uploadBytes('clean1', cleanBytes, `smoke-${runId}.txt`, 'text/plain')
if (!r1.ok) die(`clean1 expected ok=true got reason=${r1.reason}`)
const r2 = await uploadBytes('dup', cleanBytes, `smoke-dup-${runId}.txt`, 'text/plain')
if (r2.reason !== 'duplicate') die(`dup expected reason=duplicate got ${JSON.stringify(r2)}`)
const r3 = await uploadBytes('eicar', eicarBytes, `eicar-${runId}.com`, 'application/octet-stream')
if (r3.reason !== 'quarantined') die(`eicar expected reason=quarantined got ${JSON.stringify(r3)}`)
console.log('[smoke-upload] OK clean+dup+eicar all green')
