#!/usr/bin/env bun
/* eslint-disable no-console */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential by design */
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
const uploader = (env.BOOTSTRAP_ADMIN_EMAIL ?? '').split(',')[0]?.trim() ?? ''
if (!(url && testSecret && uploader)) {
  console.error('env missing')
  process.exit(2)
}
const c = new ConvexHttpClient(url)
const sleep = async (ms: number): Promise<void> =>
  new Promise(r => {
    setTimeout(r, ms)
  })
let pass = 0
let fail = 0
const check = (label: string, ok: boolean, detail: string): void => {
  console.log(`${ok ? '✓' : '✗'} ${label}: ${detail}`)
  if (ok) pass += 1
  else fail += 1
}
const N = 3
console.log(`[embed-tput] wipe + upload ${N} docs`)
await c.mutation(api.testing.wipeDocs, { testSecret })
const ids: string[] = []
const seedStart = Date.now()
for (let i = 1; i <= N; i += 1) {
  const u = await c.mutation(api.testing.docsGenerateUploadUrl, { testSecret })
  const res = await fetch(u, {
    body: new Blob([`Engineering handbook v${i}. PR review required. CI gates. Deploy via main.`.repeat(10)]),
    headers: { 'Content-Type': 'text/plain' },
    method: 'POST'
  })
  const { storageId } = (await res.json()) as { storageId: string }
  const fin = (await c.action(api.testing.docsFinalize, {
    filename: `h${i}.txt`,
    mime: 'text/plain',
    scope: 'shared',
    storageId: storageId as never,
    testSecret,
    uploaderEmail: uploader
  })) as { docId?: string }
  if (fin.docId) ids.push(fin.docId)
}
console.log(`[embed-tput] await all ${N} embeddings`)
const deadline = Date.now() + 180_000
let allDone = false
while (Date.now() < deadline) {
  let n = 0
  for (const id of ids) {
    const row = (await c.query(api.testing.getDocRow, { docId: id as never, testSecret })) as null | {
      embedding?: number[]
    }
    if (row?.embedding && row.embedding.length > 0) n += 1
  }
  if (n === N) {
    allDone = true
    break
  }
  await sleep(3000)
}
const total = (Date.now() - seedStart) / 1000
const rate = N / total
check(`all ${N} docs embedded`, allDone, `done=${allDone}`)
check('throughput ≥ 0.05 doc/s (3 docs ≤ 60s)', rate >= 0.05, `rate=${rate.toFixed(3)} doc/s total=${total.toFixed(1)}s`)
console.log(`\n[embed-tput] SUMMARY pass=${pass} fail=${fail} total=2`)
if (fail > 0) process.exit(1)
