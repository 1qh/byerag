#!/usr/bin/env bun
/* eslint-disable no-console, no-await-in-loop, @typescript-eslint/prefer-destructuring */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential by design */
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
// oxlint-disable-next-line node/no-sync
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
interface Case {
  body: string
  expectLang: 'en' | 'mixed' | 'vi'
  filename: string
}
const cases: Case[] = [
  {
    body: 'Cộng hòa xã hội chủ nghĩa Việt Nam. Độc lập - Tự do - Hạnh phúc. Quy định nội bộ về quản lý công văn và lưu trữ tài liệu.',
    expectLang: 'vi',
    filename: 'vi-policy.txt'
  },
  {
    body: 'Engineering handbook. Code reviews required for every PR. CI gates merges. Deploys via main push.',
    expectLang: 'en',
    filename: 'en-handbook.txt'
  },
  { body: '日本語の社内ポリシー。コードレビュー必須。', expectLang: 'mixed', filename: 'ja-cjk.txt' }
]
console.log('[lang] wipe + seed each')
await c.mutation(api.testing.wipeDocs, { testSecret })
for (const cs of cases) {
  const uploadUrl = await c.mutation(api.testing.docsGenerateUploadUrl, { testSecret })
  const res = await fetch(uploadUrl, {
    body: new Blob([cs.body]),
    headers: { 'Content-Type': 'text/plain' },
    method: 'POST'
  })
  const { storageId } = (await res.json()) as { storageId: string }
  const fin = (await c.action(api.testing.docsFinalize, {
    filename: cs.filename,
    mime: 'text/plain',
    scope: 'shared',
    storageId: storageId as never,
    testSecret,
    uploaderEmail: uploader
  })) as { docId?: string }
  if (!fin.docId) {
    console.error(`no docId for ${cs.filename}`)
    process.exit(1)
  }
  const { docId } = fin
  const deadline = Date.now() + 60_000
  let lang: null | string = null
  while (Date.now() < deadline) {
    const row = (await c.query(api.testing.getDocRow, { docId: docId as never, testSecret })) as null | { lang?: string }
    if (row?.lang) {
      lang = row.lang
      break
    }
    await sleep(2000)
  }
  check(`${cs.filename}: lang=${cs.expectLang}`, lang === cs.expectLang, `actual=${lang ?? '—'}`)
}
console.log(`\n[lang] SUMMARY pass=${pass} fail=${fail} total=${cases.length}`)
if (fail > 0) process.exit(1)
