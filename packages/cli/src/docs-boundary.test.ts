/** biome-ignore-all lint/nursery/noContinue: allowlist skip */
/* eslint-disable no-continue */
import { Glob } from 'bun'
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
const REPO_ROOT = resolve(import.meta.dirname, '../../..')
const FORBIDDEN = ['macmap', 'typesense', 'serper', 'tariff', 'hscode']
const ALLOWLIST = new Set(['CLAUDE.md', 'readonly'])
const isAllowed = (relPath: string): boolean => {
  for (const allowed of ALLOWLIST) if (relPath === allowed || relPath.startsWith(`${allowed}/`)) return true
  return false
}
describe('docs boundary', () => {
  test('root-level *.md files contain no business-domain tokens', async () => {
    const glob = new Glob('*.md')
    const offenders: string[] = []
    for await (const file of glob.scan({ cwd: REPO_ROOT })) {
      if (isAllowed(file)) continue
      const text = readFileSync(join(REPO_ROOT, file), 'utf8').toLowerCase()
      for (const tok of FORBIDDEN) {
        const re = new RegExp(`\\b${tok}\\b`, 'iu')
        if (re.test(text)) offenders.push(`${file}: contains '${tok}'`)
      }
    }
    expect(offenders).toEqual([])
  })
})
