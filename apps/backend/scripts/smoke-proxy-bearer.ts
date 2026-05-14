#!/usr/bin/env bun
/* eslint-disable no-console */
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
console.log('[proxy-bearer] seed chat + get secret')
const r = (await c.mutation(api.testing.sendWithSecret, {
  app: 'user',
  content: 'probe',
  email: 'proxy-test@example.com',
  testSecret
})) as { chatId: string; secret: string }
const noDashSecret = r.secret.replaceAll('-', '')
const bearer = `sk-ant-oat01-proxy_${r.chatId}_${noDashSecret}`
const site = url.replace('3210', '3211')
console.log(`[proxy-bearer] chatId=${r.chatId} site=${site}`)
const headers = {
  Authorization: `Bearer ${bearer}`,
  'Content-Type': 'application/json',
  'anthropic-version': '2023-06-01'
}
const r401 = await fetch(`${site}/api/anthropic/v1/messages`, {
  body: '{}',
  headers: { ...headers, Authorization: 'Bearer junk-token' },
  method: 'POST'
})
check('invalid bearer → 401', r401.status === 401, `status=${r401.status}`)
const r403 = await fetch(`${site}/api/anthropic/v1/forbidden`, { body: '{}', headers, method: 'POST' })
check('valid bearer + forbidden path → 403', r403.status === 403, `status=${r403.status}`)
const r400 = await fetch(`${site}/api/anthropic/v1/messages`, {
  body: 'plain',
  headers: { ...headers, 'Content-Type': 'text/plain' },
  method: 'POST'
})
check('valid bearer + non-json → 400', r400.status === 400, `status=${r400.status}`)
const oversize = JSON.stringify({ blob: 'A'.repeat(8 * 1024 * 1024) })
const r413 = await fetch(`${site}/api/anthropic/v1/messages`, { body: oversize, headers, method: 'POST' })
check('valid bearer + oversize body → 413 or 400', r413.status === 413 || r413.status === 400, `status=${r413.status}`)
console.log(`\n[proxy-bearer] SUMMARY pass=${pass} fail=${fail} total=4`)
if (fail > 0) process.exit(1)
