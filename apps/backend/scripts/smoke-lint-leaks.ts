#!/usr/bin/env bun
/* eslint-disable no-console */
import { $ } from 'bun'

const ROOT = `${import.meta.dir}/../../..`
let pass = 0
let fail = 0
const check = (label: string, ok: boolean, detail: string): void => {
  console.log(`${ok ? '✓' : '✗'} ${label}: ${detail}`)
  if (ok) pass += 1
  else fail += 1
}
console.log('[lint-leaks] grep secret-shaped patterns in tracked source')
const secretGrep =
  await $`cd ${ROOT} && git ls-files apps packages | xargs grep -l -E 'sk-ant-[a-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{20,}\\.eyJ' 2>/dev/null || true`.text()
const secretLeaks = secretGrep
  .trim()
  .split('\n')
  .filter(l => l && !l.includes('test') && !l.includes('smoke'))
check('no real sk-ant or JWT in tracked code', secretLeaks.length === 0, `hits=${secretLeaks.join(',') || 'none'}`)
console.log('[lint-leaks] grep for product-domain leak in code repo')
const domainGrep =
  await $`cd ${ROOT} && git ls-files apps packages | grep -v -E 'readonly|\\.test\\.ts|smoke|VERIFY|byerag-docs' | xargs grep -l -E 'internal docs platform|doc Q&A|knowledge base assistant|product narrative' 2>/dev/null || true`.text()
const domainLeaks = domainGrep.trim().split('\n').filter(Boolean)
check('no banned product-domain phrases in code', domainLeaks.length === 0, `hits=${domainLeaks.join(',') || 'none'}`)
console.log('[lint-leaks] grep for banned TS escape hatches')
const banGrep =
  await $`cd ${ROOT} && git ls-files 'apps/**/*.ts' 'apps/**/*.tsx' 'packages/**/*.ts' 'packages/**/*.tsx' | xargs grep -E '@ts-(ignore|expect-error|nocheck)' 2>/dev/null || true`.text()
const banHits = banGrep
  .trim()
  .split('\n')
  .filter(l => l && !l.includes('readonly/'))
check(
  'no @ts-ignore/@ts-expect-error/@ts-nocheck in tracked TS',
  banHits.length === 0,
  `hits=${banHits.slice(0, 3).join(' | ')}`
)
console.log('[lint-leaks] grep for unsafe-* lint disables in tracked source')
const unsafeGrep =
  await $`cd ${ROOT} && git ls-files 'apps/**/*.ts' 'apps/**/*.tsx' 'packages/**/*.ts' 'packages/**/*.tsx' | xargs grep -E 'disable .*no-unsafe-' 2>/dev/null || true`.text()
const unsafeHits = unsafeGrep
  .trim()
  .split('\n')
  .filter(l => l && !l.includes('readonly/'))
check('no @typescript-eslint/no-unsafe-* disables', unsafeHits.length === 0, `hits=${unsafeHits.slice(0, 3).join(' | ')}`)
console.log(`\n[lint-leaks] SUMMARY pass=${pass} fail=${fail} total=4`)
if (fail > 0) process.exit(1)
