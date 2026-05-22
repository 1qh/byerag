#!/usr/bin/env bun
/** biome-ignore-all lint/nursery/noContinue: scan-skip */
/* eslint-disable no-console, no-continue */
import { Glob } from 'bun'
import { join } from 'node:path'

const CONVEX_DIR = join(import.meta.dir, '..', 'convex')
const VALID_PATH_SEGMENT = /^[A-Za-z_][A-Za-z0-9_.]*$/u
const errors: string[] = []
for (const f of new Glob('**/*.{ts,tsx}').scanSync({ cwd: CONVEX_DIR, onlyFiles: true })) {
  if (f.includes('_generated/')) continue
  for (const seg of f.split('/'))
    if (!VALID_PATH_SEGMENT.test(seg))
      errors.push(
        `${f} → segment '${seg}' invalid (Convex requires alphanumeric/underscore/period only — hyphens forbidden)`
      )
}
if (errors.length === 0) {
  console.log('✔ all convex/ filenames are deploy-safe')
  process.exit(0)
}
console.error(`✘ ${errors.length} convex/ filename(s) would fail deploy:`)
for (const e of errors) console.error(`  ${e}`)
process.exit(1)
