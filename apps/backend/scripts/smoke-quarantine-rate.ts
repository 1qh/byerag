#!/usr/bin/env bun
/* eslint-disable no-console */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential by design */
/* oxlint-disable eslint(no-await-in-loop), eslint(no-shadow), eslint(no-unused-expressions), eslint(max-params), eslint(no-unused-vars), promise(param-names), unicorn(prefer-native-coercion-functions), unicorn(prefer-ternary) */
/** biome-ignore-all lint/style/noProcessEnv: smoke */
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
let pass = 0
let fail = 0
const check = (label: string, ok: boolean, detail: string): void => {
  console.log(`${ok ? '✓' : '✗'} ${label}: ${detail}`)
  if (ok) pass += 1
  else fail += 1
}
const EICAR = String.raw`X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*`
console.log('[quarantine-rate] wipe + 3 EICAR uploads, then 4th expects throw')
await c.mutation(api.testing.wipeDocs, { testSecret })
const upload = async (n: number): Promise<{ ok: boolean; reason?: string; thrown?: string }> => {
  try {
    const u = await c.mutation(api.testing.docsGenerateUploadUrl, { testSecret })
    const res = await fetch(u, { body: new Blob([EICAR]), headers: { 'Content-Type': 'text/plain' }, method: 'POST' })
    const { storageId } = (await res.json()) as { storageId: string }
    const r = (await c.action(api.testing.docsFinalize, {
      filename: `mal${n}.txt`,
      mime: 'text/plain',
      scope: 'shared',
      storageId: storageId as never,
      testSecret,
      uploaderEmail: uploader
    })) as { ok: boolean; reason?: string }
    return { ok: r.ok, reason: r.reason }
  } catch (error) {
    return { ok: false, thrown: error instanceof Error ? error.message : String(error) }
  }
}
const r1 = await upload(1)
check('upload 1 quarantined', !r1.ok && r1.reason === 'quarantined', JSON.stringify(r1))
const r2 = await upload(2)
check('upload 2 quarantined', !r2.ok && r2.reason === 'quarantined', JSON.stringify(r2))
const r3 = await upload(3)
check('upload 3 quarantined', !r3.ok && r3.reason === 'quarantined', JSON.stringify(r3))
const r4 = await upload(4)
const blocked = Boolean(r4.thrown?.includes('too many rejected uploads'))
check('upload 4 blocked → too many rejected uploads', blocked, JSON.stringify(r4))
console.log(`\n[quarantine-rate] SUMMARY pass=${pass} fail=${fail} total=4`)
if (fail > 0) process.exit(1)
