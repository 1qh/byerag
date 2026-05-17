/** biome-ignore-all lint/style/noProcessEnv: sandbox runtime env access */
/** biome-ignore-all lint/nursery/noUndeclaredEnvVars: secrets scrubbed post-parse */
/** biome-ignore-all lint/suspicious/noEmptyBlockStatements: intentional empty catch blocks */
/** biome-ignore-all lint/complexity/useLiteralKeys: env key access */
/** biome-ignore-all lint/performance/noDelete: cleaning env vars */
/** biome-ignore-all lint/performance/useTopLevelRegex: inline validation regex */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential retry backoff */
/* oxlint-disable eslint(no-empty), eslint(no-await-in-loop), promise/prefer-await-to-then, unicorn/prefer-top-level-await */
/* eslint-disable no-await-in-loop */
import { unstable_v2_createSession, unstable_v2_resumeSession } from '@anthropic-ai/claude-agent-sdk'
import { execSync } from 'node:child_process'
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { z } from 'zod/v4'
type CreateSessionFn = (opts: Record<string, unknown>) => SDKSession
type ResumeSessionFn = (id: string, opts: Record<string, unknown>) => SDKSession
interface SDKSession {
  send: (text: string) => void
  readonly sessionId: string
  stream: () => AsyncIterable<unknown>
}
const createSession = unstable_v2_createSession as unknown as CreateSessionFn
const resumeSession = unstable_v2_resumeSession as unknown as ResumeSessionFn
const AGENT_SKILLS_BY_APP: Record<string, Record<string, string>> = {}
const envSchema = z.object({
  CHAT_APP: z.string().min(1),
  CHAT_ID: z.string().min(1),
  CHAT_SECRET: z.string().min(1),
  CONVEX_SITE_URL: z.url().startsWith('http'),
  EFFORT: z.enum(['low', 'medium', 'high']),
  MAX_BUDGET_USD: z.coerce.number().min(0).max(100).catch(1).default(1),
  MAX_TURNS: z.coerce.number().int().min(1).max(500).catch(50).default(50),
  MODEL: z.string().min(1),
  PGID_FILE: z.string().default(''),
  RESUME_SESSION_ID: z.string().default(''),
  SYSTEM_PROMPT: z.string().min(1),
  USER_TEXT: z.string().min(1)
})
const config = envSchema.parse(process.env)
delete process.env.CHAT_SECRET
delete process.env.CLI_SESSION_SECRET
delete process.env.SYSTEM_PROMPT
delete process.env.USER_TEXT
delete process.env.ANTHROPIC_AUTH_TOKEN
delete process.env.ANTHROPIC_API_KEY
delete process.env.KIMI_API_KEY
if (config.PGID_FILE)
  try {
    const pgid = execSync(`ps -o pgid= -p ${process.pid}`).toString().trim()
    if (/^\d+$/u.test(pgid)) writeFileSync(config.PGID_FILE, pgid)
  } catch {
    /* Best-effort */
  }
const cleanEnv = { ...process.env }
delete cleanEnv.ANTHROPIC_API_KEY
delete cleanEnv.KIMI_API_KEY
delete cleanEnv.CHAT_SECRET
delete cleanEnv.CLI_SESSION_SECRET
delete cleanEnv.SYSTEM_PROMPT
delete cleanEnv.USER_TEXT
delete cleanEnv.PGID_FILE
delete cleanEnv.ANTHROPIC_AUTH_TOKEN
cleanEnv.CLAUDE_CODE_INCLUDE_PARTIAL_MESSAGES = '1'
cleanEnv.ANTHROPIC_AUTH_TOKEN = `sk-ant-oat01-proxy_${config.CHAT_ID}_${config.CHAT_SECRET.replaceAll('-', '')}`
cleanEnv.CLI_SESSION_ID = config.CHAT_ID
cleanEnv.CLI_SESSION_SECRET = config.CHAT_SECRET
const SKILLS_DIR = '/workspace/.claude/skills'
const skillNames: string[] = []
const appSkills = AGENT_SKILLS_BY_APP[config.CHAT_APP] ?? {}
for (const [name, content] of Object.entries(appSkills)) {
  const dir = `${SKILLS_DIR}/${name}`
  mkdirSync(dir, { recursive: true })
  writeFileSync(`${dir}/SKILL.md`, content)
  skillNames.push(name)
}
process.chdir('/workspace')
const opts = {
  allowDangerouslySkipPermissions: true,
  cwd: '/workspace',
  effort: config.EFFORT,
  env: cleanEnv,
  maxBudgetUsd: config.MAX_BUDGET_USD,
  maxTurns: config.MAX_TURNS,
  model: config.MODEL,
  permissionMode: 'bypassPermissions' as const,
  ...(skillNames.length > 0 && { skills: 'all' as const })
}
let session: SDKSession
let sessionWasResumed = false
if (config.RESUME_SESSION_ID)
  try {
    session = resumeSession(config.RESUME_SESSION_ID, opts)
    sessionWasResumed = true
  } catch {
    session = createSession(opts)
  }
else session = createSession(opts)
const sleep = async (ms: number): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, ms)
  })
const postJson = async (path: string, body: Record<string, unknown>): Promise<void> => {
  const url = `${config.CONVEX_SITE_URL}${path}`
  const payload = JSON.stringify(body)
  let lastErr: unknown
  for (let attempt = 0; attempt < 5; attempt += 1)
    try {
      const res = await fetch(url, {
        body: payload,
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      })
      if (res.ok) return
      if (res.status >= 400 && res.status < 500 && res.status !== 429) throw new Error(`${path} failed: ${res.status}`)
      lastErr = new Error(`${path} failed: ${res.status}`)
      if (attempt === 4) break
      const retryAfter = res.headers.get('retry-after')
      const retryAfterSec = retryAfter ? Number(retryAfter) : Number.NaN
      const delay =
        Number.isFinite(retryAfterSec) && retryAfterSec > 0
          ? Math.min(retryAfterSec * 1000, 30_000)
          : 200 * 2 ** attempt + Math.floor(Math.random() * 100)
      await sleep(delay)
    } catch (error) {
      lastErr = error
      await sleep(200 * 2 ** attempt + Math.floor(Math.random() * 100))
    }
  throw lastErr instanceof Error ? lastErr : new Error(`${path} failed`)
}
interface SDKStreamEvent {
  session_id?: string
  type?: string
}
let seq = 0
let sessionId = ''
try {
  const isNewSession = !sessionWasResumed
  const text = isNewSession
    ? `<system-instructions>\n${config.SYSTEM_PROMPT}\n</system-instructions>\n\n${config.USER_TEXT}`
    : config.USER_TEXT
  session.send(text)
  for await (const rawEvent of session.stream()) {
    const event = rawEvent as SDKStreamEvent
    if (!sessionId && event.session_id) sessionId = event.session_id
    await postJson('/api/stream/event', {
      chatId: config.CHAT_ID,
      content: JSON.stringify(event),
      secret: config.CHAT_SECRET,
      seq
    })
    seq += 1
    if (event.type === 'result') {
      await postJson('/api/stream/complete', {
        chatId: config.CHAT_ID,
        secret: config.CHAT_SECRET,
        sessionId: sessionId || session.sessionId
      })
      break
    }
  }
} catch (error) {
  await postJson('/api/stream/event', {
    chatId: config.CHAT_ID,
    content: JSON.stringify({
      error: String(error)
        .slice(-500)
        .replaceAll(/sk-ant-[^\s"]*/gu, '[REDACTED]')
        .replaceAll(/sk-kimi-[^\s"]*/gu, '[REDACTED]')
        .replaceAll(/eyJ[A-Za-z0-9._-]{20,}/gu, '[REDACTED]')
        .replaceAll(new RegExp(config.CHAT_SECRET.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`), 'gu'), '[REDACTED]')
        .replaceAll(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/gu, '[IP]')
        .replaceAll(/at\s+\S+\s+\([^)]+\)/gu, '')
        .replaceAll(/\/home\/agent\/[^\s'"]*/gu, '[PATH]'),
      type: 'error'
    }),
    secret: config.CHAT_SECRET,
    seq: 100_000
  }).catch(() => {
    /* Best effort — sandbox is about to die */
  })
  await postJson('/api/stream/complete', {
    chatId: config.CHAT_ID,
    secret: config.CHAT_SECRET,
    sessionId: sessionId || session.sessionId
  }).catch(() => {
    /* Best effort — sandbox is about to die */
  })
} finally {
  try {
    const pgid = execSync(`ps -o pgid= -p ${process.pid}`).toString().trim()
    if (/^\d+$/u.test(pgid)) {
      const children = execSync(`pgrep -g ${pgid} | grep -v ${process.pid} || true`).toString().trim()
      const pids = children.split('\n').filter(p => /^\d+$/u.test(p.trim()))
      if (pids.length > 0) execSync(`kill -9 ${pids.join(' ')} 2>/dev/null || true`)
    }
  } catch {
    /* Best-effort */
  }
  if (config.PGID_FILE)
    try {
      unlinkSync(config.PGID_FILE)
    } catch {
      /* Best-effort */
    }
}
