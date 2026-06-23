#!/usr/bin/env bun
/* eslint-disable no-console */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const env = Object.fromEntries(
  // oxlint-disable-next-line node/no-sync
  readFileSync(join(import.meta.dir, '..', '.env'), 'utf8')
    .split('\n')
    .filter(l => l.includes('='))
    .map(l => {
      const i = l.indexOf('=')
      return [l.slice(0, i), l.slice(i + 1).replaceAll(/^["']|["']$/gu, '')]
    })
) as Record<string, string>
const url = env.CONVEX_SELF_HOSTED_URL ?? ''
const testSecret = env.TEST_SECRET ?? ''
const TS = testSecret
const fetchQuery = async <T>(path: string, body: Record<string, unknown> = {}): Promise<T> => {
  const r = await fetch(`${url}/api/query`, {
    body: JSON.stringify({ args: { ...body, testSecret: TS }, path }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST'
  })
  const j = (await r.json()) as { status: string; value?: T }
  if (j.status !== 'success') throw new Error(`${path}: ${j.status}`)
  return j.value as T
}
await fetchQuery<{ topics: { _id: string; name: string; poolSize: number }[] }>('testing:countTestSuggestions')
const beforePass = await fetchQuery<{ count: number }>('testing:countAuditLogs')
console.log(`[rearm] audit rows before: ${beforePass.count}`)
console.log('[rearm] To exercise re-arm cascade end-to-end:')
console.log('  1. Pick a topic with ≥1 testPasses(kind=assigned) — typically via assignAllForTopic+attempt')
console.log(
  '  2. Call internal.training.markTopicSubstantive(topicId) — only callable as admin via session ctx; verify via /admin/dashboard ↻ button'
)
console.log(
  '  3. Confirm assigned-pass deleted + fresh testAssignments inserted + auditLog command=training.assignment.rearm'
)
console.log('[rearm] Wired-and-ready (no Convex-internal trigger from smoke; UI/admin path is canonical).')
