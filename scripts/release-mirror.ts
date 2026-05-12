#!/usr/bin/env bun
/* eslint-disable no-console */
import { $, Glob } from 'bun'
const T = process.argv[2]
if (!T) throw new Error('usage: release-mirror.ts <target-path>')
if ((await $`git status --porcelain`.text()).trim()) throw new Error('dirty dev repo')
await $`find ${T} -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +`
await $`git archive HEAD | tar -x -C ${T}`
const PLATFORM_DEV_ONLY = [
  'up.sh',
  'clean.sh',
  '.github',
  'scripts',
  'vercel.json',
  '.vercelignore',
  'apps/backend/scripts/test-credentials-e2e.ts',
  'apps/backend/scripts/smoke-agent.ts',
  'apps/backend/scripts/canary-sandbox.ts',
  'apps/backend/scripts/check-convex-deploy.ts',
  'apps/backend/scripts/check-convex-names.ts',
  'apps/backend/scripts/check-schema-migration.ts',
  'apps/backend/scripts/mutate-test.ts'
]
const APP_DEV_ONLY_PATTERNS = ['ux-eval', 'tests-e2e', 'tests-integration', 'scripts']
const appDevOnly: string[] = []
const appsGlob = new Glob('apps/*/')
for await (const dir of appsGlob.scan({ cwd: '.', onlyFiles: false }))
  for (const sub of APP_DEV_ONLY_PATTERNS) appDevOnly.push(`${dir}${sub}`)
await Promise.all([...PLATFORM_DEV_ONLY, ...appDevOnly].map(async p => $`rm -rf ${T}/${p}`))
const FIND_NAMES = ['*.md', '*.test.ts', '*.test.tsx', 'test-setup.ts']
await Promise.all(FIND_NAMES.map(async n => $`find ${T} -name ${n} -delete`))
await $`find ${T} -type d -name test-utils -exec rm -rf {} +`
await $`cd ${T} && git add -A`
const clean = (await $`cd ${T} && git diff --cached --quiet`.nothrow()).exitCode === 0
if (clean) {
  console.log('no changes')
  process.exit(0)
}
const names = (await $`cd ${T} && git diff --cached --name-only`.text()).trim().split('\n').filter(Boolean)
const areas = [
  ...new Set(
    names.map(p => {
      const i = p.indexOf('/')
      return i === -1 ? 'root' : p.slice(0, i)
    })
  )
].toSorted((a, b) => a.localeCompare(b))
const short = (await $`cd ${T} && git diff --cached --shortstat`.text()).trim()
const subject = `${short} [${areas.join(', ')}]`
await $`cd ${T} && git commit -m ${subject}`
console.log(`mirrored → ${T} (push manually)`)
