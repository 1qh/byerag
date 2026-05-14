#!/usr/bin/env bun
/* eslint-disable no-console, no-await-in-loop */
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
const bootstrapEmail = (env.BOOTSTRAP_ADMIN_EMAIL ?? '').split(',')[0]?.trim() ?? ''
const die = (msg: string): never => {
  console.error(msg)
  process.exit(2)
}
if (!(url && testSecret && bootstrapEmail)) die('env missing')
const sleep = async (ms: number): Promise<void> =>
  new Promise(r => {
    setTimeout(r, ms)
  })
const c = new ConvexHttpClient(url)
const SEED_BODY =
  'Engineering Handbook v1\n\n- Code reviews required for every PR.\n- CI must pass before merge.\n- Deploys via Dokploy on main push.\n- On-call rotation: weekly, Mon 09:00.\n- Quarterly performance reviews.\n- Incident retro template stored in /handbook/incidents.'
console.log('[matryoshka] wiping docs')
await c.mutation(api.testing.wipeDocs, { testSecret })
const uploadUrl = await c.mutation(api.testing.docsGenerateUploadUrl, { testSecret })
const res = await fetch(uploadUrl, {
  body: new Blob([SEED_BODY], { type: 'text/plain' }),
  headers: { 'Content-Type': 'text/plain' },
  method: 'POST'
})
if (!res.ok) throw new Error(`upload ${res.status}`)
const { storageId } = (await res.json()) as { storageId: string }
const fin = (await c.action(api.testing.docsFinalize, {
  filename: 'handbook.txt',
  mime: 'text/plain',
  scope: 'shared',
  storageId: storageId as never,
  testSecret,
  uploaderEmail: bootstrapEmail
})) as { docId?: string; ok: boolean }
if (!(fin.ok && fin.docId)) throw new Error('finalize failed')
const seedId = fin.docId
console.log(`[matryoshka] seeded docId=${seedId}, awaiting embedding`)
const deadline = Date.now() + 120_000
let embedded = false
while (Date.now() < deadline) {
  const row = (await c.query(api.testing.getDocRow, { docId: seedId as never, testSecret })) as null | {
    embedding?: number[]
    policyStatus?: string
  }
  if (row?.embedding && row.embedding.length > 0) {
    embedded = true
    break
  }
  await sleep(3000)
}
if (!embedded) die('embedding never arrived')
console.log('[matryoshka] embedding present; probing at 256/512/768')
let pass = 0
let fail = 0
for (const dim of [256, 512, 768]) {
  const r = await c.action(api.testingNode.docsSimilarProbe, {
    dim,
    query: 'engineering review and deploy process',
    scope: 'shared',
    testSecret
  })
  const found = r.hits.some(h => h._id === seedId)
  const ok = found && r.hits.length > 0
  const symbol = ok ? '✓' : '✗'
  console.log(
    `${symbol} dim=${dim}: hits=${r.hits.length} seedFound=${found} topScore=${r.hits[0]?._score.toFixed(4) ?? '—'}`
  )
  if (ok) pass += 1
  else fail += 1
}
console.log(`\n[matryoshka] SUMMARY pass=${pass} fail=${fail} total=3`)
if (fail > 0) process.exit(1)
