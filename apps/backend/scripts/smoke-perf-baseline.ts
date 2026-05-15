#!/usr/bin/env bun
/* eslint-disable no-console */
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
console.log('[perf] measure docs.similar via vectorSearch on small corpus')
const t0 = Date.now()
await c.action(api.testingNode.docsSimilarProbe, { dim: 768, query: 'engineering', scope: 'shared', testSecret })
const dt = Date.now() - t0
check('docs.similar round-trip < 2000ms', dt < 2000, `dt=${dt}ms`)
console.log('[perf] measure topStripProbe (admin dashboard cold)')
const t1 = Date.now()
await c.query(api.testing.topStripProbe, { testSecret })
const dt1 = Date.now() - t1
check('topStrip query < 500ms', dt1 < 500, `dt=${dt1}ms`)
console.log('[perf] measure docs.list-mine equivalent (3 wipeUserProfiles+seed roundtrips)')
const t2 = Date.now()
await c.query(api.testing.countOwnerSpend, { testSecret })
const dt2 = Date.now() - t2
check('Convex query (countOwnerSpend) < 200ms', dt2 < 200, `dt=${dt2}ms`)
console.log(`\n[perf] SUMMARY pass=${pass} fail=${fail} total=3`)
if (fail > 0) process.exit(1)
