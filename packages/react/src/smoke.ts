/* oxlint-disable unicorn/no-process-exit, promise/param-names */
/** biome-ignore-all lint/nursery/noContinue: env parser */
/** biome-ignore-all lint/performance/noAwaitInLoops: polling */
/* eslint-disable no-console, no-await-in-loop, no-continue */
import type { Id } from 'backend/convex/_generated/dataModel'
import { api } from 'backend/convex/_generated/api'
import { ConvexHttpClient } from 'convex/browser'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ENV_LINE_RE = /^\s*(?<key>[A-Z_][A-Z0-9_]*)\s*=(?<rest>.*)$/u
const parseEnv = (text: string): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    const m = ENV_LINE_RE.exec(line)
    if (m?.groups?.key) out[m.groups.key] = (m.groups.rest ?? '').trim().replaceAll(/^["']|["']$/gu, '')
  }
  return out
}
const sleep = async (ms: number): Promise<void> =>
  new Promise<void>(r => {
    setTimeout(r, ms)
  })
interface RunSmokeOpts {
  app: string
  assert: (text: { all: string; assistant: string; errors: { content: unknown }[] }) => boolean
  failureHint?: string
  prompt: string
  timeoutMs?: number
}
const runSmoke = async ({
  app,
  assert,
  failureHint = 'agent did not produce expected output',
  prompt,
  timeoutMs = 180_000
}: RunSmokeOpts): Promise<void> => {
  const repoRoot = resolve(import.meta.dirname, '..', '..', '..')
  const env = parseEnv(readFileSync(join(repoRoot, 'apps/backend/.env'), 'utf8'))
  const email = env.ALLOWED_EMAILS?.split(',')[0]?.trim() ?? env.BOOTSTRAP_ADMIN_EMAIL?.trim()
  const url = env.NEXT_PUBLIC_CONVEX_URL ?? env.CONVEX_SELF_HOSTED_URL
  const secret = env.TEST_SECRET
  if (!(email && url && secret)) {
    console.error(
      'smoke: need (ALLOWED_EMAILS or BOOTSTRAP_ADMIN_EMAIL) + NEXT_PUBLIC_CONVEX_URL + TEST_SECRET in apps/backend/.env'
    )
    process.exit(1)
  }
  const client = new ConvexHttpClient(url)
  const t0 = Date.now()
  const log = (msg: string): void => console.log(`[+${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`)
  log(`smoke ${app} as ${email} on ${url}`)
  let chatId: Id<'chats'>
  try {
    chatId = await client.mutation(api.testing.send, { app, content: prompt, email, testSecret: secret })
    log(`sent → chatId=${chatId}`)
  } catch (error: unknown) {
    console.error('smoke: send failed —', error instanceof Error ? error.message : String(error))
    process.exit(2)
  }
  let sawStreaming = false
  let sawComplete = false
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const streaming = await client.query(api.testing.getChatStreaming, { chatId, testSecret: secret })
    if (streaming) sawStreaming = true
    if (sawStreaming && !streaming) {
      sawComplete = true
      break
    }
    await sleep(2000)
  }
  if (!sawComplete) {
    console.error(`smoke: timeout after ${timeoutMs / 1000}s (sawStreaming=${sawStreaming})`)
    await client.mutation(api.testing.removeChat, { chatId, email, testSecret: secret }).catch(() => {
      /* Empty */
    })
    process.exit(3)
  }
  log('streaming ended, fetching messages')
  const page = await client.query(api.testing.listMessages, {
    chatId,
    paginationOpts: { cursor: null, numItems: 100 },
    testSecret: secret
  })
  interface Msg {
    content: unknown
    type: string
  }
  const msgs = page.page as Msg[]
  const assistantMsgs = msgs.filter(m => m.type === 'assistant')
  const errorMsgs = msgs.filter(m => m.type === 'error')
  const all = JSON.stringify(msgs).toLowerCase()
  const assistant = JSON.stringify(assistantMsgs).toLowerCase()
  const ok = assert({ all, assistant, errors: errorMsgs })
  log(`messages=${msgs.length} assistant=${assistantMsgs.length} errors=${errorMsgs.length} ok=${ok}`)
  if (errorMsgs.length > 0) console.error('error msgs:', JSON.stringify(errorMsgs).slice(0, 600))
  await client.mutation(api.testing.removeChat, { chatId, email, testSecret: secret })
  log('cleanup done')
  if (!ok) {
    console.error(`smoke: assertion failed — ${failureHint}`)
    process.exit(4)
  }
  console.log(`\n✔ smoke ${app} passed in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
}
export { runSmoke }
export type { RunSmokeOpts }
