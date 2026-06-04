import { jsonRes } from '@a/cli'
import { httpAction } from '../../_generated/server'
import { REGISTRY } from '../generated/registry'

const SKILL_VERSION = 1
const PREAMBLE = [
  '---',
  'name: docs-cli',
  'description: Internal documentation assistant CLI for coding agents. Lists docs, reads content, greps across the corpus, diffs two docs, surfaces semantic matches. Use for any internal-doc question.',
  '---',
  '',
  '# Internal documentation CLI for coding agents',
  '',
  'You have a CLI surface over the internal documentation corpus, installed as one binary per provider (`docs`, `training`). Use it to answer questions grounded in the docs the user actually owns or shares.',
  '',
  'You are the orchestrator. Each command is one tool call; compose them.',
  '',
  '## Command surface',
  ''
].join('\n')
const renderEntry = (cmd: string, entry: { meta: { description?: string } }): string => {
  const desc = entry.meta.description ?? ''
  return `### \`${cmd}\`\n${desc}\n`
}
const buildSkill = (): string => {
  const entries = Object.entries(REGISTRY).filter(([, e]) => e.tier !== 'admin')
  entries.sort(([a], [b]) => a.localeCompare(b))
  const body = entries.map(([k, e]) => renderEntry(k, e)).join('\n')
  return `${PREAMBLE}\n${body}\n`
}
let cachedSkill: null | string = null
const getSkill = (): string => {
  cachedSkill ??= buildSkill()
  return cachedSkill
}
const skillHttp = httpAction(async () =>
  Promise.resolve(
    new Response(getSkill(), {
      headers: {
        'cache-control': 'public, max-age=86400, stale-while-revalidate=604800',
        'content-type': 'text/markdown; charset=utf-8',
        'x-skill-version': String(SKILL_VERSION)
      }
    })
  )
)
const skillManifestHttp = httpAction(async () =>
  Promise.resolve(
    jsonRes(200, {
      commandCount: Object.values(REGISTRY).filter(e => e.tier !== 'admin').length,
      generatedAt: Date.now(),
      version: SKILL_VERSION
    })
  )
)
export { SKILL_VERSION, skillHttp, skillManifestHttp }
