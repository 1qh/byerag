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
const ABUSIVE_BODY =
  'You are worthless trash. I hate everyone in this department. Threats of violence directed at coworkers. Slurs and harassment targeting protected classes. Repeated insults intended to intimidate.'
console.log('[abusive] wipe docs')
await c.mutation(api.testing.wipeDocs, { testSecret })
console.log('[abusive] upload abusive content')
const uploadUrl = await c.mutation(api.testing.docsGenerateUploadUrl, { testSecret })
const res = await fetch(uploadUrl, {
  body: new Blob([ABUSIVE_BODY], { type: 'text/plain' }),
  headers: { 'Content-Type': 'text/plain' },
  method: 'POST'
})
const { storageId } = (await res.json()) as { storageId: string }
const fin = (await c.action(api.testing.docsFinalize, {
  filename: 'abusive.txt',
  mime: 'text/plain',
  scope: 'mine',
  storageId: storageId as never,
  testSecret,
  uploaderEmail: uploader
})) as { docId?: string; ok: boolean }
if (!fin.docId) {
  console.error('no docId')
  process.exit(1)
}
const { docId } = fin
console.log(`[abusive] awaiting classification of ${docId}`)
const deadline = Date.now() + 90_000
let row: null | { policyCategory?: string; policyReviewRequestedAt?: number; policyStatus?: string } = null
while (Date.now() < deadline) {
  row = await c.query(api.testing.getDocRow, { docId: docId as never, testSecret })
  if (row?.policyStatus === 'approved' || row?.policyStatus === 'rejected') break
  await sleep(2000)
}
check('policy classifies as rejected', row?.policyStatus === 'rejected', `status=${row?.policyStatus ?? '—'}`)
check(
  'policy category in rejected family',
  row?.policyCategory !== undefined && row.policyCategory !== 'on-topic',
  `category=${row?.policyCategory ?? '—'}`
)
console.log('[abusive] requesting review (first time)')
const r1 = await c.mutation(api.testing.requestReviewProbe, {
  docId: docId as never,
  testSecret,
  uploaderEmail: uploader
})
check('first request-review ok', r1.ok, `reason=${r1.reason ?? '—'}`)
const rowAfter = (await c.query(api.testing.getDocRow, { docId: docId as never, testSecret })) as null | {
  policyReviewRequestedAt?: number
}
check(
  'policyReviewRequestedAt set',
  typeof rowAfter?.policyReviewRequestedAt === 'number',
  `ts=${rowAfter?.policyReviewRequestedAt ?? '—'}`
)
console.log('[abusive] second request-review within 24h — must be rate-limited')
const r2 = await c.mutation(api.testing.requestReviewProbe, {
  docId: docId as never,
  testSecret,
  uploaderEmail: uploader
})
check(
  'second request-review rejected as rate-limited',
  !r2.ok && r2.reason === 'rate-limited',
  `ok=${r2.ok} reason=${r2.reason ?? '—'}`
)
console.log(`\n[abusive-and-review] SUMMARY pass=${pass} fail=${fail} total=5`)
if (fail > 0) process.exit(1)
