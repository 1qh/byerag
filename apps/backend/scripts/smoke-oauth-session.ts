#!/usr/bin/env bun
/* eslint-disable no-console */
/** biome-ignore-all lint/style/noProcessEnv: smoke */
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
if (!(url && testSecret)) {
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
const EMAIL = 'oauth-smoke-user@example.com'
console.log(
  '[oauth] step 1: mint session row via testing endpoint (simulates Google OAuth callback createOrUpdateUser path)'
)
const mint = await c.mutation(api.testing.mintSessionForOAuthEmail, { email: EMAIL, testSecret })
console.log(`[oauth]   userId=${mint.userId} sessionId=${mint.sessionId}`)
console.log('[oauth] step 2: sign JWT (RS256) using JWT_PRIVATE_KEY env (same key Convex auth uses)')
const tok = await c.action(api.testingNode.mintOAuthJwt, {
  sessionId: mint.sessionId,
  testSecret,
  userId: mint.userId
})
const { token } = tok
check('JWT minted (RS256)', token.split('.').length === 3, `token=${token.slice(0, 40)}…`)
console.log('[oauth] step 3: attach JWT as Authorization Bearer + call authed mutation')
const c2 = new ConvexHttpClient(url)
c2.setAuth(token)
const chatId = (await c2.mutation(api.messages.send, { app: 'user', content: 'oauth smoke probe' })) as string
check(
  'authed messages.send accepted (session cookie / bearer works)',
  typeof chatId === 'string' && chatId.length > 5,
  `chatId=${chatId}`
)
console.log('[oauth] step 4: confirm row carries authed user as owner')
const rows = (await c.query(api.testing.listChats, { email: EMAIL, testSecret })) as { owner: string }[]
check(
  'chat row owner matches authed email',
  rows.some(r => r.owner === EMAIL),
  `rows=${rows.length}`
)
console.log(`\n[oauth] SUMMARY pass=${pass} fail=${fail} total=3`)
if (fail > 0) process.exit(1)
