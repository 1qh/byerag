#!/usr/bin/env bun
/** biome-ignore-all lint/style/noProcessEnv: deploy creds */
/** biome-ignore-all lint/nursery/noUndeclaredEnvVars: deploy creds */
/* eslint-disable no-console */
import { $ } from 'bun'
const url = process.env.CONVEX_SELF_HOSTED_URL
const adminKey = process.env.CONVEX_SELF_HOSTED_ADMIN_KEY
if (!(url && adminKey)) {
  console.error('skip: CONVEX_SELF_HOSTED_URL/ADMIN_KEY not set (load apps/backend/.env or set in shell)')
  process.exit(0)
}
const r = await $`bunx convex deploy --dry-run`.cwd(`${import.meta.dir}/..`).nothrow()
process.exit(r.exitCode)
