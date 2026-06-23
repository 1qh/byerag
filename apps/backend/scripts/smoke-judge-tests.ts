#!/usr/bin/env bun
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential by design */
/* eslint-disable no-console, no-await-in-loop, @typescript-eslint/max-params */
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
// oxlint-disable-next-line node/no-sync
const env = parseEnv(readFileSync(join(import.meta.dir, '..', '.env'), 'utf8'))
const url = env.CONVEX_SELF_HOSTED_URL ?? 'http://localhost:3210'
const adminPort = '3001'
const userPort = '3003'
const ollamaPort = '11434'
console.log('[judge] A — Repos public on GitHub')
const ghRepo = async (slug: string): Promise<{ defaultBranchRef?: { name?: string }; visibility?: string }> => {
  try {
    const out = await $`gh repo view ${slug} --json visibility,defaultBranchRef`.quiet().text()
    return JSON.parse(out) as { defaultBranchRef?: { name?: string }; visibility?: string }
  } catch {
    return {}
  }
}
for (const slug of ['1qh/byerag', '1qh/byerag-doc']) {
  const r = await ghRepo(slug)
  record(
    `A.repo-${slug.split('/')[1]}`,
    `${slug} PUBLIC + default=main`,
    r.visibility === 'PUBLIC' && r.defaultBranchRef?.name === 'main',
    `visibility=${r.visibility ?? '?'} default=${r.defaultBranchRef?.name ?? '?'}`
  )
}
console.log('\n[judge] B — Local Docker stack')
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
const convexVersion = await (async (): Promise<string> => {
  try {
    const versionRes = await fetch(`${url}/version`)
    return versionRes.ok ? await versionRes.text() : `HTTP ${versionRes.status}`
  } catch (error) {
    return `ERR ${String(error).slice(0, 100)}`
  }
})()
record(
  'B.convex-version',
  `${url}/version returns 200`,
  !(convexVersion.startsWith('HTTP') || convexVersion.startsWith('ERR')),
  convexVersion.slice(0, 200)
)
const ollamaTags = await (async (): Promise<null | { models?: { name?: string }[] }> => {
  try {
    const tagsRes = await fetch(`http://localhost:${ollamaPort}/api/tags`)
    if (!tagsRes.ok) return null
    return (await tagsRes.json()) as { models?: { name?: string }[] }
  } catch {
    return null
  }
})()
const ollamaModels = ollamaTags?.models?.map(m => m.name ?? '') ?? []
const hasNomic = ollamaModels.some(n => n.includes('nomic-embed-text-v2-moe'))
record('B.ollama-nomic', 'Ollama serves nomic-embed-text-v2-moe', hasNomic, `models=${ollamaModels.join(', ')}`)
console.log('\n[judge] C — Web apps reachable')
const adminStatus = await (async (): Promise<string> => {
  try {
    const adminRes = await fetch(`http://localhost:${adminPort}/`)
    return `HTTP ${adminRes.status}`
  } catch (error) {
    return `ERR ${String(error).slice(0, 80)}`
  }
})()
record('C.admin-app', `admin app at :${adminPort} returns 200`, adminStatus === 'HTTP 200', adminStatus)
const userStatus = await (async (): Promise<string> => {
  try {
    const userRes = await fetch(`http://localhost:${userPort}/`)
    return `HTTP ${userRes.status}`
  } catch (error) {
    return `ERR ${String(error).slice(0, 80)}`
  }
})()
record('C.user-app', `user app at :${userPort} returns 200`, userStatus === 'HTTP 200', userStatus)
console.log('\n[judge] I — Cost + audit recording')
const testSecret = env.TEST_SECRET ?? ''
const convexFetch = async <T>(path: string, body: Record<string, unknown>): Promise<T> => {
  const res = await fetch(`${url}/api/query`, {
    body: JSON.stringify({ args: body, path }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST'
  })
  if (!res.ok) throw new Error(`${path} HTTP ${res.status}`)
  const j = (await res.json()) as { status: string; value?: T }
  if (j.status !== 'success') throw new Error(`${path} ${j.status}`)
  return j.value as T
}
try {
  const cost = await convexFetch<{ count: number; sampleOwners: string[] }>('testing:countCostRecords', { testSecret })
  record(
    'I.cost-records',
    `costRecords has rows (got ${cost.count})`,
    cost.count > 0,
    `count=${cost.count} owners=${cost.sampleOwners.join(',')}`
  )
} catch (error) {
  record('I.cost-records', 'costRecords has rows', false, String(error).slice(0, 200))
}
try {
  const audit = await convexFetch<{ count: number; sampleCommands: string[] }>('testing:countAuditLogs', { testSecret })
  record(
    'I.audit-logs',
    `auditLogs has rows (got ${audit.count})`,
    audit.count > 0,
    `count=${audit.count} cmds=${audit.sampleCommands.join(',')}`
  )
} catch (error) {
  record('I.audit-logs', 'auditLogs has rows', false, String(error).slice(0, 200))
}
console.log('\n[judge] G — Assessment generation pipeline')
try {
  const gen = await convexFetch<{ count: number; topicNames: string[] }>('testing:countTestSuggestions', { testSecret })
  record(
    'G.suggestions',
    `testQuestionSuggestions has rows (got ${gen.count})`,
    gen.count > 0,
    `count=${gen.count} topics=${gen.topicNames.slice(0, 3).join(',')}`
  )
} catch (error) {
  record('G.suggestions', 'testQuestionSuggestions has rows', false, String(error).slice(0, 200))
}
console.log('\n[judge] J — Test corpus + Kimi probe')
const probeLogPath = join(import.meta.dir, '..', 'test-results', 'probe-log.jsonl')
let probeAccepted = 0
try {
  // oxlint-disable-next-line node/no-sync
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
const ledgerPath = join(import.meta.dir, '..', '..', '..', '..', 'byerag-doc', 'ledger.jsonl')
let promiseFound = false
try {
  // oxlint-disable-next-line node/no-sync
  const ledgerTail = readFileSync(ledgerPath, 'utf8').split('\n').findLast(Boolean) ?? ''
  promiseFound = ledgerTail.includes('<promise>BYERAG SHIPPED') && ledgerTail.includes('</promise>')
} catch {
  // Ledger missing
}
record('K.promise', 'ledger last row contains BYERAG SHIPPED promise', promiseFound, `found=${promiseFound}`)
console.log('\n[judge] supportiveness evidence')
const evidenceDir = join(import.meta.dir, '..', 'test-results', 'supportiveness-evidence')
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
    // oxlint-disable-next-line node/no-sync
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
// oxlint-disable-next-line node/no-sync
mkdirSync(join(import.meta.dir, '..', 'test-results'), { recursive: true })
// oxlint-disable-next-line node/no-sync
writeFileSync(
  join(import.meta.dir, '..', 'test-results', 'judge-results.json'),
  `${JSON.stringify({ at: new Date().toISOString(), checks, failCount, passCount, total: checks.length }, null, 2)}\n`
)
if (failCount > 0) process.exit(1)
