#!/usr/bin/env bun
/* eslint-disable no-console */
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
if (!(url && testSecret)) {
  console.error('env missing')
  process.exit(2)
}
const c = new ConvexHttpClient(url)
const OWNER_A = 'alice.test@example.com'
const OWNER_B = 'bob.test@example.com'
const seed = async (owner: string, filename: string, body: string): Promise<string> => {
  const uploadUrl = await c.mutation(api.testing.docsGenerateUploadUrl, { testSecret })
  const res = await fetch(uploadUrl, {
    body: new Blob([body], { type: 'text/plain' }),
    headers: { 'Content-Type': 'text/plain' },
    method: 'POST'
  })
  if (!res.ok) throw new Error(`upload ${res.status}`)
  const { storageId } = (await res.json()) as { storageId: string }
  const r = (await c.action(api.testing.docsFinalize, {
    filename,
    mime: 'text/plain',
    scope: 'mine',
    storageId: storageId as never,
    testSecret,
    uploaderEmail: owner
  })) as { docId?: string; ok: boolean }
  if (!(r.ok && r.docId)) throw new Error(`finalize ${filename} failed`)
  return r.docId
}
console.log('[isolation] wiping docs')
await c.mutation(api.testing.wipeDocs, { testSecret })
console.log('[isolation] seeding A + B')
const aDoc = await seed(OWNER_A, 'alice-private.txt', 'Alice private notes: API key rotation schedule Q3.')
const bDoc = await seed(OWNER_B, 'bob-private.txt', 'Bob private notes: salary review template.')
const aRows = (await c.query(api.testing.listDocsByOwner, { owner: OWNER_A, testSecret })) as {
  _id: string
  filename: string
  owner: null | string
}[]
const bRows = (await c.query(api.testing.listDocsByOwner, { owner: OWNER_B, testSecret })) as {
  _id: string
  filename: string
  owner: null | string
}[]
let pass = 0
let fail = 0
const check = (label: string, ok: boolean, detail: string): void => {
  console.log(`${ok ? '✓' : '✗'} ${label}: ${detail}`)
  if (ok) pass += 1
  else fail += 1
}
check(
  'A sees own doc',
  aRows.some(r => r._id === aDoc),
  `aRows=${aRows.length}`
)
check('A does NOT see B doc', !aRows.some(r => r._id === bDoc), `aRows=${aRows.map(r => r.filename).join(',')}`)
check(
  'B sees own doc',
  bRows.some(r => r._id === bDoc),
  `bRows=${bRows.length}`
)
check('B does NOT see A doc', !bRows.some(r => r._id === aDoc), `bRows=${bRows.map(r => r.filename).join(',')}`)
check(
  'A rows all owned by A',
  aRows.every(r => r.owner === OWNER_A),
  `owners=${[...new Set(aRows.map(r => r.owner))].join(',')}`
)
check(
  'B rows all owned by B',
  bRows.every(r => r.owner === OWNER_B),
  `owners=${[...new Set(bRows.map(r => r.owner))].join(',')}`
)
console.log(`\n[isolation] SUMMARY pass=${pass} fail=${fail} total=6`)
if (fail > 0) process.exit(1)
