#!/usr/bin/env bun
/* eslint-disable no-console */
import { spawn } from 'bun'

const argv = process.argv.slice(2)
if (argv.length === 0) {
  console.error('q: usage: bun scripts/q.ts <cmd> [args...]')
  process.exit(2)
}
const proc = spawn({ cmd: argv, stderr: 'pipe', stdout: 'pipe' })
const out = await new Response(proc.stdout).text()
const err = await new Response(proc.stderr).text()
const rc = await proc.exited
if (rc === 0) {
  console.log('ok')
  process.exit(0)
}
process.stderr.write(out)
process.stderr.write(err)
process.exit(rc)
