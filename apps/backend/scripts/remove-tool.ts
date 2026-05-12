/* eslint-disable no-console */
/* oxlint-disable unicorn/no-process-exit */
/** biome-ignore-all lint/style/useFilenamingConvention: script */
import { $ } from 'bun'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
const pathArg = process.argv[2]
if (!pathArg) {
  console.error('usage: bun run remove-tool <provider>/<...segments>')
  console.error('  example: bun run remove-tool myprovider/foo/bar')
  process.exit(2)
}
const parts = pathArg.split('/').filter(Boolean)
if (parts.length < 2) {
  console.error('need at least <provider>/<name>')
  process.exit(2)
}
const name = parts.at(-1) ?? ''
const dir = parts.slice(0, -1).join('/')
const toolFile = join('convex/tools', dir, `${name}.ts`)
const testFile = join('convex/tools', dir, `${name}.integration.test.ts`)
let removed = 0
for (const f of [toolFile, testFile])
  if (existsSync(f)) {
    rmSync(f)
    console.log(`removed ${f}`)
    removed += 1
  }
if (removed === 0) {
  console.error(`no files found for ${pathArg}`)
  process.exit(1)
}
console.log('regenerating codegen…')
await $`bun run build-cli`.nothrow()
console.log('done.')
