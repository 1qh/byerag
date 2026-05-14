#!/usr/bin/env bun
/* eslint-disable no-console, no-await-in-loop */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential by design */
/** biome-ignore-all lint/style/noProcessEnv: smoke reads .env directly */
/** biome-ignore-all lint/nursery/noUndeclaredEnvVars: smoke env */
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { ConvexHttpClient } from 'convex/browser'
import { $ } from 'bun'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
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
const die = (msg: string): never => { console.error(msg); process.exit(2) }
if (!url) die('CONVEX_SELF_HOSTED_URL missing')
if (!testSecret) die('TEST_SECRET missing')
if (!bootstrapEmail) die('BOOTSTRAP_ADMIN_EMAIL missing')
const sleep = async (ms: number): Promise<void> => new Promise(r => { setTimeout(r, ms) })
const c = new ConvexHttpClient(url)
const SANDBOX = (await $`docker ps --filter ancestor=byerag-sandbox --format '{{.Names}}'`.text()).trim().split('\n')[0]
if (!SANDBOX) die('no running byerag-sandbox')
const TXT_BODY = `Test extract document\n\nThis is a plain text file used to verify the extract pipeline produces extractedText.\n`
const MD_BODY = `# Test extract markdown\n\nThis markdown will be converted to PDF via pandoc inside the sandbox and uploaded.\n\nKey term: PANDOC_PDF_FIXTURE_TOKEN.\n`
const seed = async (filename: string, body: Uint8Array, mime: string): Promise<string> => {
  const uploadUrl = (await c.mutation(api.testing.docsGenerateUploadUrl, { testSecret })) as string
  const res = await fetch(uploadUrl, { body: new Blob([body], { type: mime }), headers: { 'Content-Type': mime }, method: 'POST' })
  if (!res.ok) throw new Error(`upload ${filename}: ${res.status}`)
  const { storageId } = (await res.json()) as { storageId: string }
  const r = (await c.action(api.testing.docsFinalize, {
    filename,
    mime,
    scope: 'shared',
    storageId: storageId as never,
    testSecret,
    uploaderEmail: bootstrapEmail
  })) as { docId?: string; ok: boolean }
  if (!r.ok || !r.docId) throw new Error(`finalize ${filename} failed`)
  return r.docId
}
const waitExtracted = async (id: string, expectedToken: string, deadlineMs: number): Promise<{ extractedTextLen: number; foundToken: boolean }> => {
  const deadline = Date.now() + deadlineMs
  while (Date.now() < deadline) {
    const row = (await c.query(api.testing.getDocRow, { docId: id as never, testSecret })) as null | { extractedText?: string }
    if (row?.extractedText && row.extractedText.length > 0) {
      return { extractedTextLen: row.extractedText.length, foundToken: row.extractedText.includes(expectedToken) }
    }
    await sleep(2000)
  }
  return { extractedTextLen: 0, foundToken: false }
}
console.log('[extract] wiping docs')
await c.mutation(api.testing.wipeDocs, { testSecret })
console.log('[extract] case 1: text/plain')
const txtId = await seed('extract-plain.txt', new TextEncoder().encode(TXT_BODY), 'text/plain')
const r1 = await waitExtracted(txtId, 'extractedText', 60_000)
console.log(`  extractedTextLen=${r1.extractedTextLen}`)
if (r1.extractedTextLen === 0) { console.error('FAIL text/plain extract empty'); process.exit(1) }
console.log('[extract] case 2: pandoc-generated docx (via sandbox)')
const tmp = `${tmpdir()}/extract-${Date.now()}`
writeFileSync(`${tmp}.md`, MD_BODY)
await $`docker cp ${tmp}.md ${SANDBOX}:/tmp/x.md`.quiet()
await $`docker exec -u agent ${SANDBOX} sh -c "pandoc /tmp/x.md -o /tmp/x.docx"`.quiet()
await $`docker cp ${SANDBOX}:/tmp/x.docx ${tmp}.docx`.quiet()
const docxBytes = readFileSync(`${tmp}.docx`)
const docxId = await seed('extract-pandoc.docx', docxBytes, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
const r2 = await waitExtracted(docxId, 'PANDOC_PDF_FIXTURE_TOKEN', 90_000)
console.log(`  extractedTextLen=${r2.extractedTextLen} foundToken=${r2.foundToken}`)
if (!r2.foundToken) { console.error('FAIL docx extract did not surface fixture token'); process.exit(1) }
console.log('[extract] OK both text/plain + pandoc-docx extracted correctly')
