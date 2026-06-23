#!/usr/bin/env bun
/* eslint-disable no-useless-assignment */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential by design */
/** biome-ignore-all lint/performance/useTopLevelRegex: scoped regex ok */
/** biome-ignore-all lint/style/useExplicitLengthCheck: idiomatic */
/* eslint-disable no-console, no-await-in-loop */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential by design */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

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
interface Candidate {
  distinctiveFact: string
  filename: string
  snippet: string
  url: string
}
interface KimiResponse {
  content?: { text?: string; type?: string }[]
}
interface OllamaEmbedResponse {
  data?: { embedding?: number[] }[]
}
interface ProbeResult {
  acceptedAs: null | string
  candidate: Candidate
  cosine: number
  exactMatch: boolean
  kimiAnswer: string
  reason: string
  verdict: 'accept' | 'reject'
}
// oxlint-disable-next-line node/no-sync
const env = parseEnv(readFileSync(join(import.meta.dir, '..', '.env'), 'utf8'))
const KIMI_BASE = env.KIMI_BASE_URL ?? ''
const KIMI_KEY = env.KIMI_API_KEY ?? ''
const OLLAMA_HOST = env.OLLAMA_HOST ?? 'localhost'
const OLLAMA_PORT = env.OLLAMA_PORT ?? '11434'
if (!KIMI_BASE) {
  console.error('KIMI_BASE_URL missing')
  process.exit(2)
}
if (!KIMI_KEY) {
  console.error('KIMI_API_KEY missing')
  process.exit(2)
}
const FIXTURES_DIR = join(import.meta.dir, '..', 'test-fixtures')
const RESULTS_DIR = join(import.meta.dir, '..', 'test-results')
const CANDIDATES_PATH = join(FIXTURES_DIR, 'probe-candidates.jsonl')
const REAL_DOCS_DIR = join(RESULTS_DIR, 'docs', 'real')
const PROBE_LOG = join(RESULTS_DIR, 'probe-log.jsonl')
const COSINE_THRESHOLD = 0.85
const EMBED_MODEL = 'nomic-embed-text-v2-moe'
const callKimi = async (prompt: string): Promise<string> => {
  const res = await fetch(`${KIMI_BASE.replace(/\/$/u, '')}/v1/messages`, {
    body: JSON.stringify({
      max_tokens: 512,
      messages: [{ content: prompt, role: 'user' }],
      model: 'kimi-for-coding',
      system: 'Answer factually from your training knowledge. If unsure, say so explicitly.'
    }),
    headers: {
      Authorization: `Bearer ${KIMI_KEY}`,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    },
    method: 'POST',
    signal: AbortSignal.timeout(45_000)
  })
  if (!res.ok) throw new Error(`kimi ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = (await res.json()) as KimiResponse
  return json.content?.find(c => c.type === 'text')?.text ?? ''
}
const embed = async (text: string, prefix: 'search_document' | 'search_query'): Promise<number[]> => {
  const res = await fetch(`http://${OLLAMA_HOST}:${OLLAMA_PORT}/v1/embeddings`, {
    body: JSON.stringify({ input: [`${prefix}: ${text}`], model: EMBED_MODEL }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
    signal: AbortSignal.timeout(30_000)
  })
  if (!res.ok) throw new Error(`ollama ${res.status}`)
  const j = (await res.json()) as OllamaEmbedResponse
  const v = j.data?.[0]?.embedding
  if (!v?.length) throw new Error('embed empty')
  return v
}
const cosine = (a: number[], b: number[]): number => {
  let dot = 0
  let na = 0
  let nb = 0
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i += 1) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    dot += x * y
    na += x * x
    nb += y * y
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb)
}
const probe = async (c: Candidate): Promise<ProbeResult> => {
  const prompt = `What does the following say specifically? Quote exact wording if you can: ${c.distinctiveFact}`
  let kimiAnswer = ''
  try {
    kimiAnswer = await callKimi(prompt)
  } catch (error) {
    return {
      acceptedAs: null,
      candidate: c,
      cosine: 0,
      exactMatch: false,
      kimiAnswer: `KIMI_ERROR: ${String(error).slice(0, 200)}`,
      reason: 'kimi-error → accept (cannot verify Kimi knows)',
      verdict: 'accept'
    }
  }
  const lowerKimi = kimiAnswer.toLowerCase()
  const lowerSnippet = c.snippet.toLowerCase()
  const sigPhrases = lowerSnippet
    .split(/[.;\n]/u)
    .map(s => s.trim())
    .filter(s => s.length > 20)
    .slice(0, 5)
  const exactMatch = sigPhrases.some(p => lowerKimi.includes(p))
  let cos = 0
  try {
    const [eKimi, eSnippet] = await Promise.all([embed(kimiAnswer, 'search_query'), embed(c.snippet, 'search_document')])
    cos = cosine(eKimi, eSnippet)
  } catch (error) {
    return {
      acceptedAs: null,
      candidate: c,
      cosine: 0,
      exactMatch,
      kimiAnswer,
      reason: `embed-error: ${String(error).slice(0, 100)}`,
      verdict: 'reject'
    }
  }
  if (exactMatch || cos >= COSINE_THRESHOLD)
    return {
      acceptedAs: null,
      candidate: c,
      cosine: cos,
      exactMatch,
      kimiAnswer,
      reason: `kimi-knows (cosine=${cos.toFixed(3)}${exactMatch ? ', exact-substring' : ''})`,
      verdict: 'reject'
    }
  const savePath = join(REAL_DOCS_DIR, c.filename)
  // oxlint-disable-next-line node/no-sync
  mkdirSync(REAL_DOCS_DIR, { recursive: true })
  // oxlint-disable-next-line node/no-sync
  writeFileSync(savePath, c.snippet)
  return {
    acceptedAs: savePath,
    candidate: c,
    cosine: cos,
    exactMatch: false,
    kimiAnswer,
    reason: `kimi-unknown (cosine=${cos.toFixed(3)} < ${COSINE_THRESHOLD})`,
    verdict: 'accept'
  }
}
// oxlint-disable-next-line node/no-sync
if (!existsSync(CANDIDATES_PATH)) {
  console.error(`missing ${CANDIDATES_PATH}`)
  console.error(
    'Format: one JSON per line — {"url":"...","filename":"...","distinctiveFact":"...","snippet":"<full doc text>"}'
  )
  process.exit(2)
}
// oxlint-disable-next-line node/no-sync
const lines = readFileSync(CANDIDATES_PATH, 'utf8')
  .split('\n')
  .map(l => l.trim())
  .filter(Boolean)
const candidates = lines.map(l => JSON.parse(l) as Candidate)
console.log(`[pull-corpus] probing ${candidates.length} candidate(s)`)
const results: ProbeResult[] = []
for (const c of candidates) {
  console.log(`[pull-corpus] ▶ ${c.filename}: ${c.distinctiveFact.slice(0, 80)}`)
  const r = await probe(c)
  results.push(r)
  // oxlint-disable-next-line node/no-sync
  appendFileSync(PROBE_LOG, `${JSON.stringify({ ...r, at: new Date().toISOString() })}\n`)
  console.log(`[pull-corpus]   verdict=${r.verdict} reason=${r.reason}`)
}
const accepted = results.filter(r => r.verdict === 'accept').length
console.log(`\n[pull-corpus] accepted=${accepted} rejected=${results.length - accepted} total=${results.length}`)
if (accepted < 5) {
  console.error('[pull-corpus] FAIL: per ADR need ≥5 accepted real docs for VERIFY')
  process.exit(1)
}
