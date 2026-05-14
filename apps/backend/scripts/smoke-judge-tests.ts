#!/usr/bin/env bun
/* eslint-disable no-console */
/** biome-ignore-all lint/style/noProcessEnv: smoke reads .env directly */
/** biome-ignore-all lint/nursery/noUndeclaredEnvVars: smoke env */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { $ } from 'bun'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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
interface Check {
  evidence: string
  id: string
  pass: boolean
  title: string
}
const checks: Check[] = []
const record = (id: string, title: string, pass: boolean, evidence: string): void => {
  checks.push({ evidence, id, pass, title })
  console.log(`${pass ? '✓' : '✗'} ${id} ${title}`)
  if (!pass) console.log(`    evidence: ${evidence.slice(0, 300)}`)
}
const env = parseEnv(readFileSync(join(import.meta.dir, '..', '.env'), 'utf8'))
const url = env.CONVEX_SELF_HOSTED_URL ?? 'http://localhost:3210'
const adminPort = '3001'
const userPort = '3003'
const ollamaPort = '11434'
console.log('[judge] B — Local Docker stack')
const dockerPs = await $`docker ps --filter name=byerag --format '{{.Names}}'`.text()
const services = dockerPs.split('\n').filter(Boolean)
const expected = ['postgres', 'convex-backend', 'clamav']
const found = expected.filter(name => services.some(s => s.includes(name)))
record(
  'B.docker-ps',
  `≥3 byerag services running (got ${services.length})`,
  found.length === expected.length && services.length >= 3,
  `services=${services.join(', ')}`
)
const convexVersion = await fetch(`${url}/version`)
  .then(async r => (r.ok ? r.text() : `HTTP ${r.status}`))
  .catch(error => `ERR ${String(error).slice(0, 100)}`)
record(
  'B.convex-version',
  `${url}/version returns 200`,
  !(convexVersion.startsWith('HTTP') || convexVersion.startsWith('ERR')),
  convexVersion.slice(0, 200)
)
const ollamaTags = await fetch(`http://localhost:${ollamaPort}/api/tags`)
  .then(async r => (r.ok ? r.json() : null))
  .catch(() => null)
const ollamaModels = (ollamaTags as null | { models?: { name?: string }[] })?.models?.map(m => m.name ?? '') ?? []
const hasNomic = ollamaModels.some(n => n.includes('nomic-embed-text-v2-moe'))
record('B.ollama-nomic', 'Ollama serves nomic-embed-text-v2-moe', hasNomic, `models=${ollamaModels.join(', ')}`)
console.log('\n[judge] C — Web apps reachable')
const adminStatus = await fetch(`http://localhost:${adminPort}/`)
  .then(r => `HTTP ${r.status}`)
  .catch(error => `ERR ${String(error).slice(0, 80)}`)
record('C.admin-app', `admin app at :${adminPort} returns 200`, adminStatus === 'HTTP 200', adminStatus)
const userStatus = await fetch(`http://localhost:${userPort}/`)
  .then(r => `HTTP ${r.status}`)
  .catch(error => `ERR ${String(error).slice(0, 80)}`)
record('C.user-app', `user app at :${userPort} returns 200`, userStatus === 'HTTP 200', userStatus)
console.log('\n[judge] J — Test corpus + Kimi probe')
const probeLogPath = join(import.meta.dir, '..', 'test-fixtures', 'probe-log.jsonl')
let probeAccepted = 0
try {
  const probeLog = readFileSync(probeLogPath, 'utf8').split('\n').filter(Boolean)
  for (const line of probeLog) {
    const row = JSON.parse(line) as { verdict?: string }
    if (row.verdict === 'accept') probeAccepted += 1
  }
} catch {
  // File missing
}
record('J.probe-log', '≥5 accepted docs in probe-log.jsonl', probeAccepted >= 5, `accepted=${probeAccepted}`)
console.log('\n[judge] K — Final promise')
const ledgerPath = join(import.meta.dir, '..', '..', '..', '..', 'byerag-docs', 'ledger.jsonl')
let promiseFound = false
try {
  const ledgerTail = readFileSync(ledgerPath, 'utf8').split('\n').filter(Boolean).at(-1) ?? ''
  promiseFound = ledgerTail.includes('BYERAG SHIPPED')
} catch {
  // Ledger missing
}
record('K.promise', 'ledger last row contains BYERAG SHIPPED promise', promiseFound, `found=${promiseFound}`)
console.log('\n[judge] supportiveness evidence')
const evidenceDir = join(import.meta.dir, '..', 'test-fixtures', 'supportiveness-evidence')
const scenarios = [
  'cross-reference',
  'risk-spotting',
  'dot-connecting',
  'follow-up-preemption',
  'gap-flagging',
  'uncertainty-surfacing',
  'citation-discipline'
]
let scenarioPass = 0
for (const s of scenarios)
  try {
    const j = JSON.parse(readFileSync(join(evidenceDir, `${s}.json`), 'utf8')) as { verdict?: string }
    if (j.verdict === 'pass') scenarioPass += 1
  } catch {
    // Missing
  }

record(
  'supportiveness',
  `${scenarios.length} scenarios captured + verdict=pass`,
  scenarioPass === scenarios.length,
  `pass=${scenarioPass}/${scenarios.length}`
)
const passCount = checks.filter(c => c.pass).length
const failCount = checks.length - passCount
console.log(`\n[judge] SUMMARY pass=${passCount} fail=${failCount} total=${checks.length}`)
mkdirSync(join(import.meta.dir, '..', 'test-fixtures'), { recursive: true })
writeFileSync(
  join(import.meta.dir, '..', 'test-fixtures', 'judge-results.json'),
  `${JSON.stringify({ at: new Date().toISOString(), checks, failCount, passCount, total: checks.length }, null, 2)}\n`
)
if (failCount > 0) process.exit(1)
