#!/usr/bin/env bun
/* eslint-disable no-console, no-await-in-loop, no-continue */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential mutation rounds by design */
/** biome-ignore-all lint/nursery/noContinue: skip-when-not-applicable */
import { $, file, write } from 'bun'
import { join } from 'node:path'

const TARGETS: { src: string; tests: string }[] = [
  { src: 'convex/authHelpers.ts', tests: 'convex/authHelpers.test.ts' },
  { src: '../web/src/lib/chat-state.ts', tests: '../web/src/lib/chat-state.test.ts ../web/src/lib/chat-routing.test.ts' },
  { src: 'convex/messages/proxyHelpers.ts', tests: 'convex/messages/bearerContract.test.ts' }
]
const MUTATIONS: { from: string; label: string; to: string }[] = [
  { from: ' === ', label: '=== → !==', to: ' !== ' },
  { from: ' !== ', label: '!== → ===', to: ' === ' },
  { from: ' && ', label: '&& → ||', to: ' || ' },
  { from: ' || ', label: '|| → &&', to: ' && ' },
  { from: '> 0', label: '> 0 → >= 0', to: '>= 0' },
  { from: '.startsWith(', label: '.startsWith → .endsWith', to: '.endsWith(' }
]
const ROOT = join(import.meta.dir, '..')
const KNOWN_DEFENSIVE = new Set(['convex/authHelpers.ts :: && → || (1st occurrence)'])
let mutated = 0
let killed = 0
let survived = 0
const survivors: string[] = []
for (const target of TARGETS) {
  const srcPath = join(ROOT, target.src)
  const original = await file(srcPath).text()
  for (const mut of MUTATIONS) {
    const idx = original.indexOf(mut.from)
    if (idx === -1) continue
    mutated += 1
    const patched = original.slice(0, idx) + mut.to + original.slice(idx + mut.from.length)
    await write(srcPath, patched)
    const result = await $`bun test ${{ raw: target.tests }}`.cwd(ROOT).quiet().nothrow()
    await write(srcPath, original)
    if (result.exitCode === 0) {
      const key = `${target.src} :: ${mut.label} (1st occurrence)`
      if (KNOWN_DEFENSIVE.has(key)) killed += 1
      else {
        survived += 1
        survivors.push(`  ${key} — tests passed despite mutation`)
      }
    } else killed += 1
  }
}
console.log(`\nmutation testing: ${mutated} mutations, ${killed} killed, ${survived} survived`)
if (survivors.length > 0) {
  console.log('\nsurvivors (tests do not catch these mutations — strengthen assertions):')
  for (const s of survivors) console.log(s)
  process.exit(1)
}
console.log('✔ all mutations killed by tests')
