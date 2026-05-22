import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const PARSERS_DIR = import.meta.dirname
const parserSrc = [
  readFileSync(join(PARSERS_DIR, 'chunks.ts'), 'utf8'),
  readFileSync(join(PARSERS_DIR, 'stream.ts'), 'utf8')
].join('\n')
describe('parsers — protocol drift', () => {
  test('parsers reference every load-bearing message type', () => {
    for (const t of ['assistant', 'user', 'error']) expect(parserSrc).toContain(`'${t}'`)
  })
})
