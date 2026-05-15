#!/usr/bin/env bun
/* eslint-disable no-console, no-await-in-loop, no-continue, max-depth */
/* oxlint-disable eslint(no-await-in-loop), eslint(max-depth), eslint-plugin-promise(param-names) */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential env push by design */
/** biome-ignore-all lint/style/noProcessEnv: TLS config */
/** biome-ignore-all lint/nursery/noUndeclaredEnvVars: process.argv only */
/** biome-ignore-all lint/nursery/noContinue: env parser */
import { $, file } from 'bun'
import { createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { APPS } from '../convex/apps/manifest'
const APP_TARGET_VARS = Object.values(APPS).flatMap(a => a.syncTargetKeys)
const REQUIRED = [
  'AUTH_GOOGLE_ID',
  'AUTH_GOOGLE_SECRET',
  'BOOTSTRAP_ADMIN_EMAIL',
  'CONVEX_SELF_HOSTED_ADMIN_KEY',
  'CONVEX_SELF_HOSTED_URL',
  'CONVEX_SITE_URL',
  'KIMI_API_KEY',
  'KIMI_BASE_URL',
  'NEXT_PUBLIC_CONVEX_URL',
  'SANDBOX_CONVEX_SITE_URL',
  'SANDBOX_IMAGE',
  'SITE_URL'
] as const
const PLATFORM_TARGET_VARS = [
  'ALLOW_DEV_TOKENS',
  'ALLOW_TESTING_ENDPOINTS',
  'AUTH_GOOGLE_ID',
  'AUTH_GOOGLE_SECRET',
  'BOOTSTRAP_ADMIN_EMAIL',
  'CONVEX_SELF_HOSTED_URL',
  'KIMI_API_KEY',
  'KIMI_BASE_URL',
  'SANDBOX_CONVEX_SITE_URL',
  'SANDBOX_IMAGE',
  'SITE_URL',
  'TEST_SECRET'
] as const
const die = (msg: string): never => {
  console.error(`fatal: ${msg}`)
  process.exit(1)
}
const ENV_KEY_RE = /^\s*(?<key>[A-Za-z_][A-Za-z0-9_]*)\s*=(?<rest>.*)$/u
const parseDotEnv = (text: string): Record<string, string> => {
  const out: Record<string, string> = {}
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? ''
    if (!line.trim() || line.trim().startsWith('#')) continue
    const m = ENV_KEY_RE.exec(line)
    if (!m?.groups) continue
    const { key } = m.groups
    let rest = m.groups.rest ?? ''
    if (!key) continue
    const quote = rest.startsWith('"') ? '"' : rest.startsWith("'") ? "'" : null
    let value: string
    if (quote) {
      rest = rest.slice(1)
      const closeOnSame = rest.indexOf(quote)
      if (closeOnSame !== -1 && !rest.slice(0, closeOnSame).endsWith('\\')) value = rest.slice(0, closeOnSame)
      else {
        const buf = [rest]
        i += 1
        while (i < lines.length) {
          const next = lines[i] ?? ''
          const close = next.indexOf(quote)
          if (close !== -1) {
            buf.push(next.slice(0, close))
            break
          }
          buf.push(next)
          i += 1
        }
        value = buf.join('\n')
      }
    } else value = rest.trim()
    if (key in out) throw new Error(`duplicate key '${key}' in .env`)
    out[key] = value
  }
  return out
}
const readDotEnv = async (): Promise<Record<string, string>> => {
  let text: string
  try {
    text = await file('.env').text()
  } catch {
    return die('.env not found — run from apps/backend or use `bun run sync` from repo root')
  }
  return parseDotEnv(text)
}
const loadEnvOrDie = async (): Promise<{ adminKey: string; selfHostedUrl: string; vars: Record<string, string> }> => {
  const vars = await readDotEnv()
  const missing = REQUIRED.filter(k => !vars[k])
  if (missing.length > 0) die(`.env missing: ${missing.join(', ')}`)
  const selfHostedUrl = vars.CONVEX_SELF_HOSTED_URL ?? die('unreachable')
  const adminKey = vars.CONVEX_SELF_HOSTED_ADMIN_KEY ?? die('unreachable')
  if (vars.NEXT_PUBLIC_CONVEX_URL !== selfHostedUrl)
    die(`NEXT_PUBLIC_CONVEX_URL (${vars.NEXT_PUBLIC_CONVEX_URL}) must equal CONVEX_SELF_HOSTED_URL (${selfHostedUrl})`)
  if (!vars.KIMI_API_KEY) die('KIMI_API_KEY must be set')
  if (!vars.KIMI_BASE_URL?.startsWith('https://')) die('KIMI_BASE_URL must be https://')
  return { adminKey, selfHostedUrl, vars }
}
const writeKeyInEnv = (key: string, value: string): void => {
  const text = readFileSync('.env', 'utf8')
  const lines = text.split('\n')
  const idx = lines.findIndex(l => l.startsWith(`${key}=`))
  const newLine = `${key}=${value}`
  if (idx === -1) lines.push(newLine)
  else lines[idx] = newLine
  writeFileSync('.env', lines.join('\n'))
}
const makeSetVar =
  (baseUrl: string, key: string) =>
  async (name: string, value: string): Promise<void> => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const res = await fetch(`${baseUrl}/api/update_environment_variables`, {
        body: JSON.stringify({ changes: [{ name, value }] }),
        headers: { Authorization: `Convex ${key}`, 'Content-Type': 'application/json' },
        method: 'POST',
        tls: { rejectUnauthorized: true }
      } as RequestInit)
      if (res.ok) {
        console.log(`✔ ${name}`)
        return
      }
      if (attempt === 2) die(`setVar ${name} failed: ${res.status} ${await res.text()}`)
      await new Promise<void>(resolve => {
        setTimeout(resolve, 1000)
      })
    }
  }
const jwksFromPrivateKey = (privPem: string): string => {
  const priv = createPrivateKey(privPem)
  const pub = createPublicKey(priv)
  const pubJwk = { ...pub.export({ format: 'jwk' }), alg: 'RS256', kid: 'convex-self-hosted', use: 'sig' }
  return JSON.stringify({ keys: [pubJwk] })
}
const isEmptyJwks = (s: string | undefined): boolean => {
  if (!s) return true
  try {
    const parsed = JSON.parse(s) as { keys?: unknown[] }
    return !Array.isArray(parsed.keys) || parsed.keys.length === 0
  } catch {
    return true
  }
}
const fetchBackendVar = async (name: string): Promise<string> => {
  const res = await $`bunx convex env get ${name}`.quiet().nothrow()
  return res.exitCode === 0 ? res.stdout.toString().trim() : ''
}
const ensureAuthKeys = async (
  setVar: (name: string, value: string) => Promise<void>,
  vars: Record<string, string>
): Promise<void> => {
  const listRes = await $`bunx convex env list`.quiet().nothrow()
  if (listRes.exitCode !== 0)
    die(
      `convex env list failed (${listRes.exitCode}) — refusing to touch JWT keys (would log out all users). Retry after fixing.`
    )
  const existing = new Set(
    listRes.stdout
      .toString()
      .split('\n')
      .map(l => l.split('=')[0] ?? '')
  )
  const backendHasPriv = existing.has('JWT_PRIVATE_KEY')
  const backendHasJwks = existing.has('JWKS')
  if (backendHasPriv && backendHasJwks) {
    const backendJwks = await fetchBackendVar('JWKS')
    if (isEmptyJwks(backendJwks)) {
      console.log('⚠ Backend JWKS is empty — regenerating from existing JWT_PRIVATE_KEY (sessions preserved)...')
      const privPem = vars.JWT_PRIVATE_KEY ?? (await fetchBackendVar('JWT_PRIVATE_KEY'))
      if (!privPem) die('JWKS empty but JWT_PRIVATE_KEY unrecoverable — manual recovery required.')
      const jwks = jwksFromPrivateKey(privPem)
      await setVar('JWKS', jwks)
      writeKeyInEnv('JWKS', jwks)
      return
    }
    if (vars.JWT_PRIVATE_KEY && vars.JWKS) console.log('✔ JWT keys already set (skipped to preserve sessions)')
    else console.log('⚠ JWT keys on backend but missing from .env — fetch via `bunx convex env get` and add to .env')
    return
  }
  if (vars.JWT_PRIVATE_KEY && vars.JWKS && !isEmptyJwks(vars.JWKS)) {
    console.log('Pushing JWT keys from .env to fresh backend...')
    await setVar('JWT_PRIVATE_KEY', vars.JWT_PRIVATE_KEY)
    await setVar('JWKS', vars.JWKS)
    return
  }
  if (vars.JWT_PRIVATE_KEY && isEmptyJwks(vars.JWKS)) {
    console.log('Regenerating JWKS from existing .env JWT_PRIVATE_KEY...')
    const jwks = jwksFromPrivateKey(vars.JWT_PRIVATE_KEY)
    await setVar('JWT_PRIVATE_KEY', vars.JWT_PRIVATE_KEY)
    await setVar('JWKS', jwks)
    writeKeyInEnv('JWKS', jwks)
    return
  }
  console.log('Generating JWT keys for Convex Auth (fresh) and persisting to .env...')
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const privPem = pair.privateKey.export({ format: 'pem', type: 'pkcs8' }).trim()
  const jwks = jwksFromPrivateKey(privPem)
  await setVar('JWT_PRIVATE_KEY', privPem)
  await setVar('JWKS', jwks)
  writeKeyInEnv('JWT_PRIVATE_KEY', `"${privPem}"`)
  writeKeyInEnv('JWKS', jwks)
}
const runSyncOnce = async (): Promise<void> => {
  const { adminKey, selfHostedUrl, vars } = await loadEnvOrDie()
  console.log(`Using KIMI_API_KEY from .env (${vars.KIMI_API_KEY?.slice(0, 12) ?? ''}...)`)
  const setVar = makeSetVar(selfHostedUrl, adminKey)
  console.log(
    `Syncing ${PLATFORM_TARGET_VARS.length} platform + ${APP_TARGET_VARS.length} per-app env vars to Convex...\n`
  )
  for (const key of PLATFORM_TARGET_VARS) {
    const value = vars[key]
    if (!value) die(`${key} missing — add to .env first`)
    await setVar(key, value)
  }
  for (const key of APP_TARGET_VARS) {
    const value = vars[key]
    if (value) await setVar(key, value)
    else console.log(`⚠ ${key} not in .env — skipped (per-app, may degrade tool behavior)`)
  }
  await ensureAuthKeys(setVar, vars)
  console.log('\nDone.')
}
const HELP = `bun sync — one-shot env push + JWT key ensure
Usage:
  bun sync           push apps/backend/.env vars to Convex backend, ensure JWT keys, exit
  bun sync --help    this help
`
const main = async (): Promise<void> => {
  const rawArgs = process.argv.slice(2)
  if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
    console.log(HELP)
    process.exit(0)
  }
  if (rawArgs.some(a => !a.startsWith('--'))) {
    console.error(`unknown arg(s): ${rawArgs.filter(a => !a.startsWith('--')).join(' ')}\n`)
    console.error(HELP)
    process.exit(1)
  }
  await runSyncOnce()
  process.exit(0)
}
if (import.meta.main) await main()
export { ensureAuthKeys, loadEnvOrDie, makeSetVar, parseDotEnv, readDotEnv, runSyncOnce, writeKeyInEnv }
