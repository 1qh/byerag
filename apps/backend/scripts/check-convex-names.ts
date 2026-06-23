#!/usr/bin/env bun
/* eslint-disable no-console */
import { Glob } from 'bun'
import { join } from 'node:path'

const CONVEX_DIR = join(import.meta.dir, '..', 'convex')
const VALID_PATH_SEGMENT = /^[A-Za-z_][A-Za-z0-9_.]*$/u
const errors: string[] = []
// oxlint-disable-next-line node/no-sync
for (const f of new Glob('**/*.{ts,tsx}').scanSync({ cwd: CONVEX_DIR, onlyFiles: true }))
  if (!f.includes('_generated/'))
    for (const seg of f.split('/'))
      if (!VALID_PATH_SEGMENT.test(seg))
        errors.push(
          `${f} → segment '${seg}' invalid (Convex requires alphanumeric/underscore/period only — hyphens forbidden)`
        )
if (errors.length === 0) {
  console.log('✔ all convex/ filenames are deploy-safe')
  process.exit(0)
}
console.error(`✘ ${errors.length} convex/ filename(s) would fail deploy:`)
for (const e of errors) console.error(`  ${e}`)
process.exit(1)
