#!/usr/bin/env bun
/* eslint-disable no-console, no-await-in-loop */
/* oxlint-disable eslint(no-await-in-loop) */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential poll by design */
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
if (!url) die('CONVEX_SELF_HOSTED_URL missing')
if (!testSecret) die('TEST_SECRET missing')
if (!bootstrapEmail) die('BOOTSTRAP_ADMIN_EMAIL missing')
const sleep = async (ms: number): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, ms)
  })
const DEADLINE_MS = 360_000
const POLL_MS = 3000
const client = new ConvexHttpClient(url)
console.log(`[smoke-agent-docs] target=${url} email=${bootstrapEmail}`)
await client.mutation(api.testing.wipeDocs, { testSecret })
console.log('[smoke-agent-docs] wiped docs')
const seedDoc = async (filename: string, body: string): Promise<string> => {
  const uploadUrl = await client.mutation(api.testing.docsGenerateUploadUrl, { testSecret })
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
const idA = await seedDoc('offer-letter.txt', 'Offer Letter\n\nSection 3.4 PTO: Employee receives 15 days PTO per year.\n')
const idB = await seedDoc('pto-policy.txt', 'PTO Policy\n\nAll staff receive 20 days PTO per year, accrued monthly.\n')
console.log(`[smoke-agent-docs] seeded A=${idA} B=${idB}`)
const waitApproved = async (id: string): Promise<void> => {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    const row = (await client.query(api.testing.getDocRow, { docId: id as never, testSecret })) as null | {
      embedding?: number[]
      policyStatus?: string
    }
    if (row?.policyStatus === 'approved' && (row.embedding?.length ?? 0) > 0) return
    await sleep(POLL_MS)
  }
  throw new Error(`doc ${id} not approved+embedded within 60s`)
}
await waitApproved(idA)
await waitApproved(idB)
console.log('[smoke-agent-docs] both docs approved+embedded')
const chatId = await client.mutation(api.testing.send, {
  app: 'user',
  content: `Compare the two shared docs ${idA} and ${idB} for conflicts using docs tools. Report the conflict and cite excerpts.`,
  email: bootstrapEmail,
  testSecret
})
console.log(`[smoke-agent-docs] chat created chatId=${chatId}`)
interface Message {
  content: string
  type: string
}
interface Page {
  continueCursor: null | string
  isDone: boolean
  page: Message[]
}
const fetchAllMessages = async (): Promise<Message[]> => {
  let cursor: null | string = null
  const out: Message[] = []
  for (let i = 0; i < 30; i += 1) {
    const r = (await client.query(api.testing.listMessages, {
      chatId,
      paginationOpts: { cursor, numItems: 200 },
      testSecret
    })) as Page
    out.push(...r.page)
    if (r.isDone) break
    cursor = r.continueCursor
  }
  return out
}
const deadline = Date.now() + DEADLINE_MS
let messages: Message[] = []
let toolNames = new Set<string>()
let done = false
const TOOL_RE = /\bdocs\s+(?<verb>list|read|grep|conflict|similar)\b/gu
while (Date.now() < deadline) {
  messages = await fetchAllMessages()
  toolNames = new Set<string>()
  for (const m of messages) for (const x of m.content.matchAll(TOOL_RE)) if (x.groups?.verb) toolNames.add(x.groups.verb)
  done = messages.some(m => m.type === 'result')
  if (done) break
  await sleep(POLL_MS)
}
const typeCounts: Record<string, number> = {}
for (const m of messages) typeCounts[m.type] = (typeCounts[m.type] ?? 0) + 1
console.log(`[smoke-agent-docs] messages=${messages.length} types=${JSON.stringify(typeCounts)} done=${done}`)
console.log(`[smoke-agent-docs] toolsInvoked=${[...toolNames].join(',')}`)
if (toolNames.size === 0) {
  console.error('[smoke-agent-docs] FAIL agent invoked no docs tools')
  process.exit(1)
}
console.log('[smoke-agent-docs] OK agent used docs tools end-to-end')
