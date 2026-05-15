#!/usr/bin/env bun
/* eslint-disable no-console, @typescript-eslint/no-unnecessary-condition */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential by design */
/* oxlint-disable eslint(no-await-in-loop), eslint(no-shadow), eslint(no-unused-expressions), eslint(max-params), eslint(no-unused-vars), promise(param-names), unicorn(prefer-native-coercion-functions), unicorn(prefer-ternary) */
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
if (!(url && testSecret)) {
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
const ADMIN = 'policy-admin@example.com'
const NEW_POLICY = 'Updated corpus policy: accept Vietnamese engineering, finance, legal docs.'
console.log('[policy-edit] set new corpus_policy via admin probe')
await c.mutation(api.testing.setSetting, { adminEmail: ADMIN, key: 'corpus_policy', testSecret, value: NEW_POLICY })
const s1 = await c.query(api.testing.getSetting, { key: 'corpus_policy', testSecret })
check('value persisted', s1?.value === NEW_POLICY, `value=${s1?.value?.slice(0, 30)}…`)
check('updatedBy === admin', s1?.updatedBy === ADMIN, `updatedBy=${s1?.updatedBy}`)
const audit = (await c.query(api.testing.countAuditLogs, { testSecret })) as { sampleCommands: string[] }
check(
  'audit has settings.set row',
  audit.sampleCommands.includes('settings.set'),
  `sample=${audit.sampleCommands.join(',')}`
)
console.log(`\n[policy-edit] SUMMARY pass=${pass} fail=${fail} total=3`)
if (fail > 0) process.exit(1)
