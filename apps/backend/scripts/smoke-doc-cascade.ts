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
let pass = 0
let fail = 0
const check = (label: string, ok: boolean, detail: string): void => {
  console.log(`${ok ? '✓' : '✗'} ${label}: ${detail}`)
  if (ok) pass += 1
  else fail += 1
}
console.log('[doc-cascade] wipe + seed doc + topic + 2 suggestions + 2 questions tied to doc')
await c.mutation(api.testing.wipeDocs, { testSecret })
await c.mutation(api.testing.wipeTrainingTables, { testSecret })
const uploadUrl = await c.mutation(api.testing.docsGenerateUploadUrl, { testSecret })
const res = await fetch(uploadUrl, {
  body: new Blob(['source doc']),
  headers: { 'Content-Type': 'text/plain' },
  method: 'POST'
})
const { storageId } = (await res.json()) as { storageId: string }
const fin = (await c.action(api.testing.docsFinalize, {
  filename: 'source.txt',
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
const topicId = await c.mutation(api.testing.seedTopicWithPool, { name: 'DC', poolSize: 0, testSecret })
await c.mutation(api.testing.seedSuggestionWithDoc, { docId: docId as never, testSecret, topicId: topicId as never })
await c.mutation(api.testing.seedSuggestionWithDoc, { docId: docId as never, testSecret, topicId: topicId as never })
await c.mutation(api.testing.seedQuestionWithDoc, { docId: docId as never, testSecret, topicId: topicId as never })
await c.mutation(api.testing.seedQuestionWithDoc, { docId: docId as never, testSecret, topicId: topicId as never })
console.log('[doc-cascade] adminDeleteDoc → cascades to suggestions + questions')
const r = await c.mutation(api.testing.adminDeleteDocProbe, {
  adminEmail: uploader,
  docId: docId as never,
  testSecret
})
check('2 pending suggestions auto-rejected', r.pendingSuggestionsCancelled === 2, `count=${r.pendingSuggestionsCancelled}`)
check('2 canonical questions soft-deleted', r.questionsSoftDeleted === 2, `count=${r.questionsSoftDeleted}`)
console.log(`\n[doc-cascade] SUMMARY pass=${pass} fail=${fail} total=2`)
if (fail > 0) process.exit(1)
