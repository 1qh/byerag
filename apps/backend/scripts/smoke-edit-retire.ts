#!/usr/bin/env bun
/* eslint-disable no-console */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential by design */
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
console.log('[edit-retire] wipe + seed topic pool=5')
await c.mutation(api.testing.wipeUserProfiles, { testSecret })
await c.mutation(api.testing.wipeTrainingTables, { testSecret })
const topicId = await c.mutation(api.testing.seedTopicWithPool, { name: 'ER', poolSize: 5, testSecret })
const questions = (await c.query(api.testing.listQuestionsForTopic, { testSecret, topicId: topicId as never })) as {
  _id: string
}[]
const qid = questions[0]?._id
if (!qid) {
  console.error('no questions')
  process.exit(1)
}
const before = (await c.query(api.testing.getQuestionRow, { questionId: qid as never, testSecret })) as {
  revision: number
}
check('initial revision === 1', before.revision === 1, `revision=${before.revision}`)
console.log('[edit-retire] edit question → revision++ + content changed')
await c.mutation(api.testing.editQuestionProbe, {
  choices: ['X', 'Y', 'Z'],
  correctIndex: 2,
  prompt: 'Edited prompt?',
  questionId: qid as never,
  testSecret
})
const afterEdit = (await c.query(api.testing.getQuestionRow, { questionId: qid as never, testSecret })) as {
  choices: string[]
  correctIndex: number
  prompt: string
  revision: number
}
check('revision === 2 after edit', afterEdit.revision === 2, `revision=${afterEdit.revision}`)
check('prompt updated', afterEdit.prompt === 'Edited prompt?', `prompt=${afterEdit.prompt}`)
check(
  'choices updated',
  JSON.stringify(afterEdit.choices) === '["X","Y","Z"]',
  `choices=${JSON.stringify(afterEdit.choices)}`
)
check('correctIndex updated', afterEdit.correctIndex === 2, `correctIndex=${afterEdit.correctIndex}`)
console.log('[edit-retire] retire question → deletedAt + deleteReason')
await c.mutation(api.testing.retireQuestionProbe, { questionId: qid as never, testSecret })
const afterRetire = (await c.query(api.testing.getQuestionRow, { questionId: qid as never, testSecret })) as {
  deletedAt?: number
  deleteReason?: string
}
check('deletedAt set', typeof afterRetire.deletedAt === 'number', `deletedAt=${afterRetire.deletedAt ?? 'null'}`)
check(
  'deleteReason === admin-retire',
  afterRetire.deleteReason === 'admin-retire',
  `deleteReason=${afterRetire.deleteReason}`
)
console.log(`\n[edit-retire] SUMMARY pass=${pass} fail=${fail} total=7`)
if (fail > 0) process.exit(1)
