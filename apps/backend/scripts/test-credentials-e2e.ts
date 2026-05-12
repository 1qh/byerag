#!/usr/bin/env bun
/** biome-ignore-all lint/style/noProcessEnv: script env access */
/** biome-ignore-all lint/nursery/noUndeclaredEnvVars: TEST_SECRET */
/* eslint-disable no-console */
import { $ } from 'bun'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseDotEnv } from './sync'
let passed = 0
let failed = 0
const check = (name: string, cond: boolean, detail = ''): void => {
  if (cond) {
    passed += 1
    console.log(`  ✔ ${name}`)
  } else {
    failed += 1
    console.log(`  ✘ ${name}  ${detail}`)
  }
}
console.log('[1] parseDotEnv unit')
{
  const text = 'A=1\nB="multi\nline"\nC=plain\n#COMMENT=skip\n'
  const out = parseDotEnv(text)
  check('A=1', out.A === '1')
  check('B multi-line', out.B === 'multi\nline')
  check('C plain', out.C === 'plain')
  check('comment skipped', !('COMMENT' in out))
}
console.log('[2] parseDotEnv rejects duplicate key')
{
  let threw = false
  try {
    parseDotEnv('A=1\nA=2\n')
  } catch {
    threw = true
  }
  check('dup throws or exits', threw, 'parseDotEnv silently allowed duplicate')
}
console.log('[3] sync --once round-trip')
{
  const result = await $`bun scripts/sync.ts`.cwd(join(import.meta.dir, '..')).nothrow()
  check('exit 0', result.exitCode === 0, `exit=${result.exitCode}`)
  const out = result.stdout.toString()
  check('mirrors platform targets', out.includes('✔ ANTHROPIC_API_KEY') && out.includes('✔ E2B_API_KEY'))
  check('JWT preserved', out.includes('JWT keys already set'))
}
console.log('[4] sync rejects OAuth token shape')
{
  const tmpEnv = join(import.meta.dir, '..', '.env.test-bad')
  writeFileSync(
    tmpEnv,
    [
      'ALLOWED_EMAILS=x',
      'ANTHROPIC_API_KEY=sk-ant-oat01-shouldreject',
      'AUTH_GOOGLE_ID=x',
      'AUTH_GOOGLE_SECRET=x',
      'CONVEX_SELF_HOSTED_ADMIN_KEY=x',
      'CONVEX_SELF_HOSTED_URL=https://x.example.com',
      'CONVEX_SITE_URL=https://x.example.com',
      'E2B_API_KEY=x',
      'NEXT_PUBLIC_CONVEX_URL=https://x.example.com',
      'SITE_URL=https://x.example.com',
      'TEMPLATE_ID=x'
    ].join('\n')
  )
  const result =
    await $`cd ${join(import.meta.dir, '..')} && cp .env .env.bak && cp .env.test-bad .env && bun scripts/sync.ts ; rc=$? ; cp .env.bak .env ; rm -f .env.bak .env.test-bad ; exit $rc`.nothrow()
  check('rejects oat01 token', result.exitCode !== 0, `exit=${result.exitCode}`)
  const err = result.stderr.toString() + result.stdout.toString()
  check('error mentions paid API key', /paid API key|sk-ant-api/u.test(err))
}
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
