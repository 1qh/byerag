#!/usr/bin/env bun
/* eslint-disable no-console, no-await-in-loop */
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
const uploader = (env.BOOTSTRAP_ADMIN_EMAIL ?? '').split(',')[0]?.trim() ?? ''
if (!(url && testSecret && uploader)) {
  console.error('env missing')
  process.exit(2)
}
const c = new ConvexHttpClient(url)
const sleep = async (ms: number): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, ms)
  })
let pass = 0
let fail = 0
const check = (label: string, ok: boolean, detail: string): void => {
  console.log(`${ok ? '✓' : '✗'} ${label}: ${detail}`)
  if (ok) pass += 1
  else fail += 1
}
console.log('[soft-delete-purge] wipe + seed doc + await embedding')
await c.mutation(api.testing.wipeDocs, { testSecret })
const body = 'Engineering handbook. Code reviews required for every PR. CI gates merges. Deploys via main push.'.repeat(20)
const uploadUrl = await c.mutation(api.testing.docsGenerateUploadUrl, { testSecret })
const res = await fetch(uploadUrl, {
  body: new Blob([body]),
  headers: { 'Content-Type': 'text/plain' },
  method: 'POST'
})
const { storageId } = (await res.json()) as { storageId: string }
const fin = (await c.action(api.testing.docsFinalize, {
  filename: 'handbook.txt',
  mime: 'text/plain',
  scope: 'shared',
  storageId: storageId as never,
  testSecret,
  uploaderEmail: uploader
})) as { docId?: string }
if (!fin.docId) {
  console.error('no docId')
  process.exit(1)
}
const { docId } = fin
const deadline = Date.now() + 120_000
while (Date.now() < deadline) {
  const row = (await c.query(api.testing.getDocRow, { docId: docId as never, testSecret })) as null | {
    embedding?: number[]
  }
  if (row?.embedding && row.embedding.length > 0) break
  await sleep(3000)
}
const chunksBefore = (await c.query(api.testing.countChunksForDoc, { docId: docId as never, testSecret })) as {
  count: number
}
check('chunks exist before delete', chunksBefore.count > 0, `count=${chunksBefore.count}`)
console.log('[soft-delete-purge] soft-delete')
await c.mutation(api.testing.softDeleteDocProbe, { docId: docId as never, testSecret })
const afterSoft = (await c.query(api.testing.getDocRow, { docId: docId as never, testSecret })) as null | {
  deletedAt?: number
  storageId?: string
}
check(
  'deletedAt set after soft delete',
  typeof afterSoft?.deletedAt === 'number',
  `deletedAt=${afterSoft?.deletedAt ?? '—'}`
)
check(
  'storageId still present (not purged yet)',
  Boolean(afterSoft?.storageId),
  `storageId=${afterSoft?.storageId ?? '—'}`
)
console.log('[soft-delete-purge] run purge cron — should NO-OP (< 30d)')
const r1 = await c.action(api.testing.runPurgeSoftDeleted, { testSecret })
check(
  'fresh soft-delete skipped',
  r1.blobsPurged === 0 && r1.chunksPurged === 0,
  `blobs=${r1.blobsPurged} chunks=${r1.chunksPurged}`
)
console.log('[soft-delete-purge] age deletedAt by 31d')
await c.mutation(api.testing.ageDocDeletedAt, { ageMs: 31 * 86_400_000, docId: docId as never, testSecret })
console.log('[soft-delete-purge] run purge cron — should purge blob + chunks')
const r2 = await c.action(api.testing.runPurgeSoftDeleted, { testSecret })
check('aged soft-delete purged blob', r2.blobsPurged === 1, `blobs=${r2.blobsPurged}`)
check(
  'chunks deleted',
  r2.chunksPurged === chunksBefore.count,
  `chunks=${r2.chunksPurged} (expected ${chunksBefore.count})`
)
const afterPurge = (await c.query(api.testing.getDocRow, { docId: docId as never, testSecret })) as null | {
  deletedAt?: number
  storageId?: string
}
check('storageId cleared after purge', !afterPurge?.storageId, `storageId=${afterPurge?.storageId ?? 'null'}`)
check(
  'doc row retained for audit (deletedAt still set)',
  typeof afterPurge?.deletedAt === 'number',
  `deletedAt=${afterPurge?.deletedAt ?? '—'}`
)
const chunksAfter = (await c.query(api.testing.countChunksForDoc, { docId: docId as never, testSecret })) as {
  count: number
}
check('chunks count === 0 after purge', chunksAfter.count === 0, `count=${chunksAfter.count}`)
console.log(`\n[soft-delete-purge] SUMMARY pass=${pass} fail=${fail} total=8`)
if (fail > 0) process.exit(1)
