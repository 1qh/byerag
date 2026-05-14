#!/usr/bin/env bun
/* eslint-disable no-console */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential by design */
/** biome-ignore-all lint/style/noProcessEnv: smoke reads .env directly */
/** biome-ignore-all lint/nursery/noUndeclaredEnvVars: smoke env */
import { ConvexHttpClient } from 'convex/browser'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
const probe = await fetch(`${url}/api/query`, {
  body: JSON.stringify({ args: { testSecret }, path: 'testing:countTestSuggestions' }),
  headers: { 'Content-Type': 'application/json' },
  method: 'POST'
})
const j = (await probe.json()) as { status: string; value?: { count: number; topicNames: string[] } }
if (j.status !== 'success' || !j.value || j.value.count === 0) {
  console.error('[attempt-smoke] FAIL no suggestions seeded — run smoke-training-gen first')
  process.exit(1)
}
console.log(`[attempt-smoke] suggestions present: ${j.value.count}, topics=${j.value.topicNames.join(', ')}`)
console.log('[attempt-smoke] OK seeded state ready for manual UI attempt flow')
