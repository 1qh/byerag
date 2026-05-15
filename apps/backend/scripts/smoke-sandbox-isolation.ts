#!/usr/bin/env bun
/* eslint-disable no-console, @typescript-eslint/max-params */
/** biome-ignore-all lint/style/noProcessEnv: smoke reads .env directly */
/** biome-ignore-all lint/nursery/noUndeclaredEnvVars: smoke env */
import { $ } from 'bun'
const SANDBOX_CONTAINER = (await $`docker ps --filter ancestor=byerag-sandbox --format '{{.Names}}'`.text())
  .trim()
  .split('\n')[0]
if (!SANDBOX_CONTAINER) {
  console.error('[isolation] no running byerag-sandbox container; spawn one via a chat first')
  process.exit(2)
}
interface Check {
  evidence: string
  id: string
  pass: boolean
  title: string
}
const checks: Check[] = []
const record = (id: string, title: string, pass: boolean, evidence: string): void => {
  checks.push({ evidence, id, pass, title })
  console.log(`${pass ? '✓' : '✗'} ${id} ${title}`)
  if (!pass) console.log(`    evidence: ${evidence.slice(0, 200)}`)
}
const exec = async (cmd: string): Promise<{ exitCode: number; output: string }> => {
  try {
    const out = await $`docker exec -u agent ${SANDBOX_CONTAINER} sh -c ${cmd}`.text()
    return { exitCode: 0, output: out }
  } catch (error) {
    return {
      exitCode: 1,
      output: String((error as { stderr?: { toString: () => string } }).stderr ?? error).slice(0, 200)
    }
  }
}
console.log(`[isolation] target=${SANDBOX_CONTAINER}`)
const r1 = await exec('curl -sS --max-time 5 https://api.kimi.com/ 2>&1; echo EXIT=$?')
record(
  'net.api.kimi.com-blocked',
  'sandbox cannot reach api.kimi.com directly',
  /EXIT=[1-9]|name.*resolution|not resolve|timeout/iu.test(r1.output),
  r1.output
)
const r2 = await exec('curl -sS --max-time 5 http://attacker.local/ 2>&1; echo EXIT=$?')
record(
  'net.attacker-blocked',
  'sandbox cannot reach attacker.local',
  /EXIT=[1-9]|name.*resolution|not resolve|timeout|refused/iu.test(r2.output),
  r2.output
)
const r3 = await exec(
  `node -e "fetch('http://convex-backend:3211/version').then(r => r.text()).then(t => { console.log(t); process.exit(0) }).catch(e => { console.error(e.message); process.exit(1) })"`
)
record(
  'net.convex-allowed',
  'sandbox can reach convex-backend:3211',
  r3.exitCode === 0 && (r3.output.includes('"version"') || r3.output.length > 0),
  r3.output
)
const r4 = await exec('cat /etc/passwd 2>&1 | head -3; echo EXIT=$?')
record(
  'fs.passwd-readable',
  '/etc/passwd readable as agent (gVisor deferred to prod)',
  r4.output.includes('root:'),
  r4.output
)
const r5 = await exec('whoami; id -u; id -g')
record(
  'user.agent-uid-1000',
  'sandbox runs as user agent (uid=1000)',
  r5.output.includes('agent') && r5.output.includes('1000'),
  r5.output
)
const passCount = checks.filter(c => c.pass).length
const failCount = checks.length - passCount
console.log(`\n[isolation] SUMMARY pass=${passCount} fail=${failCount} total=${checks.length}`)
if (failCount > 0) process.exit(1)
