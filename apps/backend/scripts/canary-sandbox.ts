#!/usr/bin/env bun
/* eslint-disable no-console */
/* eslint-disable no-await-in-loop */
/* oxlint-disable eslint(no-await-in-loop) */
/** biome-ignore-all lint/performance/noAwaitInLoops: rebuild + smoke is sequential */
import { $ } from 'bun'
import { join } from 'node:path'
import { APPS } from '../convex/apps/manifest'
const ROOT = join(import.meta.dir, '..')
const REPO_ROOT = join(ROOT, '..', '..')
console.log('[canary] rebuilding e2b template...')
const build = await $`bunx e2b template build -c "${ROOT}/sandbox/e2b.Dockerfile"`.cwd(`${ROOT}/sandbox`).nothrow()
if (build.exitCode !== 0) {
  console.error('✘ e2b template build failed — base image may have drifted')
  process.exit(1)
}
console.log(`[canary] template rebuilt; running ${Object.keys(APPS).length} app smoke(s) against fresh sandbox`)
for (const [id, app] of Object.entries(APPS)) {
  const smoke = await $`bun scripts/smoke.ts`.cwd(join(REPO_ROOT, app.smokeDir)).nothrow()
  if (smoke.exitCode !== 0) {
    console.error(`✘ smoke failed for app '${id}' — runtime regression`)
    process.exit(2)
  }
}
console.log('✔ canary passed: fresh image + smoke green')
