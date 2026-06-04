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
const env = parseEnv(readFileSync(join(import.meta.dir, '..', '.env'), 'utf8'))
const url = env.CONVEX_SELF_HOSTED_URL ?? ''
const testSecret = env.TEST_SECRET ?? ''
if (!(url && testSecret)) {
  console.error('env missing CONVEX_SELF_HOSTED_URL or TEST_SECRET')
  process.exit(1)
}
const userId = process.argv[2] ?? 'cascade-user@example.com'
const overdueTopic = process.argv[3] ?? 'Tổ chức'
const passedTopic = process.argv[4] ?? 'Quy trình gửi thư'
const c = new ConvexHttpClient(url)
const DAY = 86_400_000
const list: { _id: string; name: string }[] = await c.query(api.testing.listTopicsForTest, { testSecret })
console.log(`fetched ${list.length} topics`)
const overdueId = list.find(t => t.name === overdueTopic)?._id
const passedId = list.find(t => t.name === passedTopic)?._id
if (!(overdueId && passedId)) {
  console.error(`missing topic ids: overdue=${overdueId}, passed=${passedId}`)
  process.exit(1)
}
const now = Date.now()
const backdate = await c.mutation(api.testing.backdateAssignments, {
  createdAt: now - 20 * DAY,
  dueAtMs: now - 4 * DAY,
  testSecret,
  topicId: overdueId,
  userId
})
console.log(`backdated ${backdate.patched} assignment(s) for ${overdueTopic} → overdue 4d`)
await c.mutation(api.testing.seedTestPass, { kind: 'assigned', testSecret, topicId: passedId, userId })
console.log(`seeded assigned-pass for ${passedTopic}`)
console.log('done')
