/* eslint-disable no-console, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/prefer-optional-chain */
/** biome-ignore-all lint/complexity/useOptionalChain: explicit narrow */
/* oxlint-disable promise/prefer-await-to-then, promise/prefer-await-to-callbacks */
import { $ } from 'bun'
import { watch } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve('convex/tools')
const SKIP = /(?<gen>_generated|\.generated\.)/u
console.log(`watching ${ROOT} for .ts changes — regen on save`)
let pending = false
let running = false
const trigger = async (): Promise<void> => {
  if (running) {
    pending = true
    return
  }
  running = true
  pending = false
  console.log('→ bun run build-cli')
  await $`bun run build-cli`.nothrow()
  running = false
  if (pending) await trigger()
}
const onChange = async (_event: unknown, filename: null | string): Promise<void> => {
  if (!(filename && filename.endsWith('.ts')) || SKIP.test(filename)) return
  console.log(`changed: ${filename}`)
  await trigger()
}
watch(ROOT, { recursive: true }, (e, f) => {
  onChange(e, f).catch((error: unknown) => {
    console.error(error)
  })
})
await new Promise(() => {
  //
})
