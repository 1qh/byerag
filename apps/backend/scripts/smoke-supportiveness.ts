#!/usr/bin/env bun
/* eslint-disable no-console, no-await-in-loop */
/* oxlint-disable eslint(no-await-in-loop) */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential by design */
/** biome-ignore-all lint/style/noProcessEnv: smoke reads .env directly */
/** biome-ignore-all lint/nursery/noUndeclaredEnvVars: smoke env */
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { ConvexHttpClient } from 'convex/browser'
import { readFileSync, writeFileSync } from 'node:fs'
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
interface Message {
  content: string
  type: string
}
interface Page {
  continueCursor: null | string
  isDone: boolean
  page: Message[]
}
interface Scenario {
  corpus: { body: string; filename: string }[]
  expectedToolsAny: string[]
  judge: {
    citationRegex: string
    minCitations: number
    mustContainKeywords: string[]
  }
  minToolCalls: number
  name: string
  prompt: string
}
interface Verdict {
  citationsFound: number
  finalAssistantText: string
  keywordsHit: string[]
  keywordsMissed: string[]
  reason: string
  scenario: string
  toolsInvoked: string[]
  verdict: 'fail' | 'pass'
}
const env = parseEnv(readFileSync(join(import.meta.dir, '..', '.env'), 'utf8'))
const url = env.CONVEX_SELF_HOSTED_URL ?? ''
const testSecret = env.TEST_SECRET ?? ''
const bootstrapEmail = (env.BOOTSTRAP_ADMIN_EMAIL ?? '').split(',')[0]?.trim() ?? ''
const die = (msg: string): never => {
  console.error(msg)
  process.exit(2)
}
if (!url) die('CONVEX_SELF_HOSTED_URL missing')
if (!testSecret) die('TEST_SECRET missing')
if (!bootstrapEmail) die('BOOTSTRAP_ADMIN_EMAIL missing')
const sleep = async (ms: number): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, ms)
  })
const RUN_DEADLINE_MS = 420_000
const POLL_MS = 4000
const EVIDENCE_DIR = join(import.meta.dir, '..', 'test-fixtures', 'supportiveness-evidence')
const SCENARIOS_PATH = join(import.meta.dir, '..', 'test-fixtures', 'supportiveness-scenarios.json')
const allScenarios = (JSON.parse(readFileSync(SCENARIOS_PATH, 'utf8')) as { scenarios: Scenario[] }).scenarios
const filter = process.argv[2] ?? ''
const scenarios = filter ? allScenarios.filter(s => s.name === filter) : allScenarios
if (scenarios.length === 0) die(`no scenarios match filter='${filter}'`)
const client = new ConvexHttpClient(url)
const seedDoc = async (filename: string, body: string): Promise<string> => {
  const uploadUrl = (await client.mutation(api.testing.docsGenerateUploadUrl, { testSecret })) as string
  const res = await fetch(uploadUrl, {
    body: new Blob([body], { type: 'text/plain' }),
    headers: { 'Content-Type': 'text/plain' },
    method: 'POST'
  })
  if (!res.ok) throw new Error(`upload ${filename}: ${res.status}`)
  const { storageId } = (await res.json()) as { storageId: string }
  const result = await client.action(api.testing.docsFinalize, {
    filename,
    mime: 'text/plain',
    scope: 'shared',
    storageId: storageId as never,
    testSecret,
    uploaderEmail: bootstrapEmail
  })
  const r = result as { docId?: string; ok: boolean }
  if (!(r.ok && r.docId)) throw new Error(`finalize ${filename} failed: ${JSON.stringify(result)}`)
  return r.docId
}
const waitApproved = async (id: string): Promise<void> => {
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    const row = (await client.query(api.testing.getDocRow, { docId: id as never, testSecret })) as null | {
      embedding?: number[]
      policyStatus?: string
    }
    if (row?.policyStatus === 'approved' && (row.embedding?.length ?? 0) > 0) return
    await sleep(3000)
  }
  throw new Error(`doc ${id} not approved+embedded within 90s`)
}
const fetchAllMessages = async (chatId: string): Promise<Message[]> => {
  let cursor: null | string = null
  const out: Message[] = []
  for (let i = 0; i < 30; i += 1) {
    const r = (await client.query(api.testing.listMessages, {
      chatId: chatId as never,
      paginationOpts: { cursor, numItems: 200 },
      testSecret
    })) as Page
    out.push(...r.page)
    if (r.isDone) break
    cursor = r.continueCursor
  }
  return out
}
const TOOL_RE = /\bdocs\s+(?<verb>list|read|grep|conflict|similar|diff)\b/gu
const ASSISTANT_TEXT_RE = /"type":"text","text":"(?<txt>(?:[^"\\]|\\.)*)"/gu
const extractAssistantText = (messages: Message[]): string => {
  const parts: string[] = []
  for (const m of messages)
    if (m.type === 'assistant') {
      for (const match of m.content.matchAll(ASSISTANT_TEXT_RE))
        if (match.groups?.txt)
          parts.push(match.groups.txt.replaceAll(String.raw`\n`, '\n').replaceAll(String.raw`\"`, '"'))
    }

  return parts.join('\n')
}
const judge = (s: Scenario, messages: Message[]): Verdict => {
  const tools = new Set<string>()
  for (const m of messages) for (const x of m.content.matchAll(TOOL_RE)) if (x.groups?.verb) tools.add(x.groups.verb)
  const toolsInvoked = [...tools]
  const finalText = extractAssistantText(messages)
  const citationRe = new RegExp(s.judge.citationRegex, 'giu')
  const citationsFound = [...finalText.matchAll(citationRe)].length
  const lower = finalText.toLowerCase()
  const keywordsHit: string[] = []
  const keywordsMissed: string[] = []
  for (const kw of s.judge.mustContainKeywords) (lower.includes(kw.toLowerCase()) ? keywordsHit : keywordsMissed).push(kw)
  const reasons: string[] = []
  if (toolsInvoked.length < s.minToolCalls) reasons.push(`toolCalls<${s.minToolCalls} (got ${toolsInvoked.length})`)
  if (!toolsInvoked.some(t => s.expectedToolsAny.includes(t)))
    reasons.push(`no expected tool in [${s.expectedToolsAny.join(',')}]`)
  if (keywordsMissed.length > 0) reasons.push(`keywords missing: ${keywordsMissed.join(',')}`)
  if (citationsFound < s.judge.minCitations) reasons.push(`citations<${s.judge.minCitations} (got ${citationsFound})`)
  return {
    citationsFound,
    finalAssistantText: finalText.slice(0, 4000),
    keywordsHit,
    keywordsMissed,
    reason: reasons.length === 0 ? 'all checks passed' : reasons.join('; '),
    scenario: s.name,
    toolsInvoked,
    verdict: reasons.length === 0 ? 'pass' : 'fail'
  }
}
const runScenario = async (s: Scenario): Promise<Verdict> => {
  console.log(`\n[supportiveness] ▶ ${s.name}`)
  await client.mutation(api.testing.wipeDocs, { testSecret })
  const docIds: string[] = []
  for (const doc of s.corpus) docIds.push(await seedDoc(doc.filename, doc.body))
  for (const id of docIds) await waitApproved(id)
  console.log(`[supportiveness] ${s.name}: seeded ${docIds.length} doc(s), all approved+embedded`)
  const chatId = (await client.mutation(api.testing.send, {
    app: 'user',
    content: s.prompt,
    email: bootstrapEmail,
    testSecret
  })) as string
  console.log(`[supportiveness] ${s.name}: chatId=${chatId}`)
  const deadline = Date.now() + RUN_DEADLINE_MS
  let messages: Message[] = []
  while (Date.now() < deadline) {
    messages = await fetchAllMessages(chatId)
    if (messages.some(m => m.type === 'result')) break
    await sleep(POLL_MS)
  }
  const v = judge(s, messages)
  writeFileSync(
    join(EVIDENCE_DIR, `${s.name}.json`),
    `${JSON.stringify({ ...v, chatId, docIds, messageCount: messages.length, prompt: s.prompt }, null, 2)}\n`
  )
  console.log(
    `[supportiveness] ${s.name}: verdict=${v.verdict} tools=[${v.toolsInvoked.join(',')}] citations=${v.citationsFound} reason=${v.reason}`
  )
  return v
}
const verdicts: Verdict[] = []
for (const s of scenarios) verdicts.push(await runScenario(s))
const pass = verdicts.filter(v => v.verdict === 'pass').length
const fail = verdicts.length - pass
console.log(`\n[supportiveness] SUMMARY pass=${pass} fail=${fail} total=${verdicts.length}`)
for (const v of verdicts) console.log(`  ${v.verdict === 'pass' ? '✓' : '✗'} ${v.scenario}: ${v.reason}`)
if (fail > 0) process.exit(1)
