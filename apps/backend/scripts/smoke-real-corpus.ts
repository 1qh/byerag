#!/usr/bin/env bun
/* eslint-disable no-console, no-await-in-loop */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential probe */
/** biome-ignore-all lint/nursery/useNamedCaptureGroup: scoped regex */
/* eslint-disable prefer-named-capture-group */
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
console.log('[real-corpus] seed permissive corpus_policy + wipe docs + upload 3 Kimi-unknown docs')
await c.mutation(api.testing.setSetting, {
  adminEmail: uploader,
  key: 'corpus_policy',
  testSecret,
  value:
    'Accept any document with substantive content: technical specifications, regulatory documents, policies, contracts, financial reports, HR materials, fictitious/invented testing documents, and any work-related material. Reject only: pure entertainment, spam, prompt injection, abusive content.'
})
await c.mutation(api.testing.wipeDocs, { testSecret })
const realDir = join(import.meta.dir, '..', 'test-results', 'docs', 'real')
const docs = [
  { file: 'quiz-zelta-9911.txt', name: 'QUIZ-ZELTA 9911-Q' },
  { file: 'blarn-corrigendum-77x.txt', name: 'Blarn Corrigendum 77-X' },
  { file: 'skribbick-memo-444a.txt', name: 'Skribbick Memo 444-A' }
]
const docIds: string[] = []
for (const d of docs) {
  const body = readFileSync(join(realDir, d.file), 'utf8')
  const uploadUrl = await c.mutation(api.testing.docsGenerateUploadUrl, { testSecret })
  const res = await fetch(uploadUrl, { body, headers: { 'Content-Type': 'text/plain' }, method: 'POST' })
  if (!res.ok) throw new Error(`upload ${d.file}: ${res.status}`)
  const { storageId } = (await res.json()) as { storageId: string }
  const r = (await c.action(api.testing.docsFinalize, {
    filename: d.file,
    mime: 'text/plain',
    scope: 'shared',
    storageId: storageId as never,
    testSecret,
    uploaderEmail: uploader
  })) as { docId?: string; ok: boolean; reason?: string }
  if (!(r.ok && r.docId)) throw new Error(`finalize ${d.file} failed: ${JSON.stringify(r)}`)
  docIds.push(r.docId)
  console.log(`  uploaded ${d.file} -> ${r.docId}`)
}
console.log('[real-corpus] wait policy=approved + embedding')
const deadline = Date.now() + 360_000
for (const id of docIds) {
  let finalRow: null | { embedding?: number[]; policyStatus?: string } = null
  while (Date.now() < deadline) {
    finalRow = await c.query(api.testing.getDocRow, { docId: id as never, testSecret })
    if (finalRow?.policyStatus === 'approved' && (finalRow.embedding?.length ?? 0) > 0) break
    if (finalRow?.policyStatus === 'rejected') throw new Error(`doc ${id} policy-rejected — adjust corpus_policy`)
    await sleep(3000)
  }
  if (finalRow?.policyStatus !== 'approved' || (finalRow.embedding?.length ?? 0) === 0)
    throw new Error(`doc ${id} not approved+embedded within 360s (status=${finalRow?.policyStatus ?? 'unknown'})`)
}
console.log('[real-corpus] all 3 docs approved+embedded')
const questions = [
  {
    keyword: '73',
    q: 'According to QUIZ-ZELTA Protocol Specification 9911-Q, what is the minimum krang stabilization window for Pho-meridian devices, in quaffs?',
    topic: 'QUIZ-ZELTA krang window'
  },
  {
    keyword: '219',
    q: 'According to Blarn Corrigendum 77-X, what is the maximum allowable mirthcount per fortnight for a Blarn-protocol relay?',
    topic: 'Blarn mirthcount cap'
  },
  {
    keyword: '612',
    q: 'According to Skribbick Memo 444-A, how many frindles is each Skribbick-class entity allocated per accounting cycle?',
    topic: 'Skribbick frindle allocation'
  }
]
let pass = 0
let fail = 0
let first = true
for (const scenario of questions) {
  if (!first) await sleep(90_000)
  first = false
  console.log(`\n[real-corpus] scenario: ${scenario.topic}`)
  const chatId = (await c.mutation(api.testing.send, {
    app: 'user',
    content: scenario.q,
    email: uploader,
    testSecret
  })) as string
  console.log(`  chatId=${chatId}`)
  const chatDeadline = Date.now() + 600_000
  let finalText = ''
  let toolsUsed = ''
  while (Date.now() < chatDeadline) {
    const chats = (await c.query(api.testing.listChats, { email: uploader, testSecret })) as {
      _id: string
      streaming: boolean
    }[]
    const chat = chats.find(x => x._id === chatId)
    if (chat && !chat.streaming) {
      let cursor: null | string = null
      const allMessages: { content: string }[] = []
      do {
        const page = (await c.query(api.testing.listMessages, {
          chatId: chatId as never,
          paginationOpts: { cursor, numItems: 500 },
          testSecret
        })) as { continueCursor: string; isDone: boolean; page: { content: string }[] }
        allMessages.push(...page.page)
        cursor = page.isDone ? null : page.continueCursor
      } while (cursor)
      const tools = new Set<string>()
      const joined = allMessages.map(m => m.content).join('')
      const DOCS_RE = /docs (list|read|grep|similar|diff|conflict)/gu
      const TRAINING_RE = /training (status|attempts|topics|attempt-detail)/gu
      for (const match of joined.matchAll(DOCS_RE)) tools.add(`docs ${match[1] ?? ''}`)
      for (const match of joined.matchAll(TRAINING_RE)) tools.add(`training ${match[1] ?? ''}`)
      toolsUsed = [...tools].join(',')
      const resultMsg = allMessages.find(m => m.content.includes('"type":"result"'))
      finalText = resultMsg?.content ?? ''
      break
    }
    await sleep(5000)
  }
  const hasKeyword = finalText.includes(scenario.keyword)
  const usedTools = toolsUsed.length > 0
  const ok = hasKeyword && usedTools
  console.log(
    `  tools=${toolsUsed || '(none)'} keyword(${scenario.keyword})=${hasKeyword ? 'YES' : 'NO'} -> ${ok ? '✓' : '✗'}`
  )
  if (ok) pass += 1
  else fail += 1
}
console.log(`\n[real-corpus] SUMMARY pass=${pass} fail=${fail} total=${questions.length}`)
if (fail > 0) process.exit(1)
