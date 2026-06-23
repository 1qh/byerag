#!/usr/bin/env node
/** biome-ignore-all lint/suspicious/noUndeclaredEnvVars: CLI binary reads runtime env directly */
/** biome-ignore-all lint/style/noProcessEnv: CLI binary reads env directly */
/** biome-ignore-all lint/suspicious/noControlCharactersInRegex: sanitize strips control chars */
/* eslint-disable no-console, no-control-regex, @typescript-eslint/no-unnecessary-condition */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { didYouMean, parseFlags } from '../src/parser'

const STRIP_RE = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/gu
const KEBAB_RE = /^[a-z][a-z0-9-]*$/u
const strip = (s: string): string => s.replaceAll(STRIP_RE, '')
const parseEnvLine = (vars: Record<string, string>, line: string): void => {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return
  const eq = trimmed.indexOf('=')
  if (eq === -1) return
  const key = trimmed.slice(0, eq).trim()
  let value = trimmed.slice(eq + 1).trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    value = value.slice(1, -1).trim()
  vars[key] = value
}
const parseEnvFile = (path: string): Record<string, string> => {
  const vars: Record<string, string> = {}
  try {
    // oxlint-disable-next-line node/no-sync
    const text = readFileSync(path, 'utf8')
    for (const line of text.split('\n')) parseEnvLine(vars, line)
  } catch {
    /* Ok */
  }
  return vars
}
const isProjectRoot = (dir: string): boolean => {
  try {
    // oxlint-disable-next-line node/no-sync
    readFileSync(join(dir, 'package.json'))
    // oxlint-disable-next-line node/no-sync
    readFileSync(join(dir, '.env'))
    return true
  } catch {
    return false
  }
}
const findProjectRoot = (): string => {
  let dir = process.cwd()
  for (let i = 0; i < 20; i += 1) {
    if (isProjectRoot(dir)) return dir
    const parent = join(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  return process.cwd()
}
interface Auth {
  baseUrl: string
  body?: Record<string, string>
  headers?: Record<string, string>
}
const resolveAuth = (): Auth => {
  const sessionSecret = process.env.CLI_SESSION_SECRET
  const sessionId = process.env.CLI_SESSION_ID
  const siteUrl = process.env.CONVEX_SITE_URL
  if (sessionSecret && sessionId && siteUrl) return { baseUrl: siteUrl, body: { secret: sessionSecret, sessionId } }
  const root = findProjectRoot()
  const env = parseEnvFile(join(root, '.env'))
  const adminKey = env.CONVEX_SELF_HOSTED_ADMIN_KEY ?? process.env.CONVEX_SELF_HOSTED_ADMIN_KEY
  const devSiteUrl = env.CONVEX_SITE_URL ?? process.env.CONVEX_SITE_URL
  if (adminKey && devSiteUrl) {
    const identity = Buffer.from(JSON.stringify({ issuer: 'x-cli', subject: 'dev' })).toString('base64')
    return { baseUrl: devSiteUrl, headers: { Authorization: `Convex ${adminKey}:${identity}` } }
  }
  const apiKey = env.X_API_KEY ?? process.env.X_API_KEY
  const apiSiteUrl = env.CONVEX_SITE_URL ?? process.env.CONVEX_SITE_URL
  if (apiKey && apiSiteUrl) return { baseUrl: apiSiteUrl, headers: { Authorization: `Bearer ${apiKey}` } }
  console.error(
    'No auth found. Set CLI_SESSION_ID+CLI_SESSION_SECRET (sandbox), CONVEX_SELF_HOSTED_ADMIN_KEY (dev), or X_API_KEY (user) in env.'
  )
  process.exit(1)
}
const auth = resolveAuth()
const INTERNAL_HOST_RE = /^https?:\/\/(?:localhost|127\.0\.0\.1|convex-backend|host\.docker\.internal)(?::\d+)?(?:\/|$)/u
if (!(auth.baseUrl.startsWith('https://') || INTERNAL_HOST_RE.test(auth.baseUrl))) {
  console.error('error: HTTPS required for non-internal hosts. Refusing to send credentials over insecure connection.')
  process.exit(1)
}
const call = async (path: string, body: Record<string, unknown> = {}): Promise<{ data: unknown; status: number }> => {
  let res: Response
  try {
    res = await fetch(`${auth.baseUrl}${path}`, {
      body: JSON.stringify({ ...auth.body, ...body }),
      headers: { 'Content-Type': 'application/json', ...auth.headers },
      method: 'POST',
      signal: AbortSignal.timeout(60_000)
    })
  } catch (error) {
    console.error(`connection failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
  let data: unknown
  try {
    data = await res.json()
  } catch {
    data = null
  }
  return { data, status: res.status }
}
interface Manifest {
  tree: Record<string, ManifestNode>
  version: number
}
interface ManifestArg {
  aliases?: string[]
  description: string
  enum?: string[]
  integer?: boolean
  max?: number
  maxLength?: number
  min?: number
  minLength?: number
  name: string
  pattern?: string
  required: boolean
  type: string
}
interface ManifestCommand {
  args: ManifestArg[]
  cost: string
  deprecated?: null | { message: string; replacedBy: string }
  description: string
  deterministic: boolean
  errorCodes: string[]
  examples: string[]
  output: unknown
}
interface ManifestNode {
  children?: Record<string, ManifestNode>
  command?: ManifestCommand
  description?: string
  kind: 'command' | 'group' | 'provider'
}
const fetchManifest = async (): Promise<Manifest> => {
  const r = await call('/api/cli/manifest')
  if (r.status !== 200) {
    console.error('manifest fetch failed:', JSON.stringify(r.data))
    process.exit(1)
  }
  return r.data as Manifest
}
const walkPathInTree = (tree: Record<string, ManifestNode>, path: string[]): ManifestNode | null => {
  let cur: ManifestNode | undefined
  let children: Record<string, ManifestNode> | undefined = tree
  for (const seg of path) {
    if (!children) return null
    const found: ManifestNode | undefined = children[seg]
    if (!found) return null
    cur = found
    ;({ children } = found)
  }
  return cur ?? null
}
const printTree = (tree: Record<string, ManifestNode>, indent = 0): void => {
  for (const [name, node] of Object.entries(tree)) {
    const pad = '  '.repeat(indent)
    const desc = node.description ?? node.command?.description ?? ''
    console.log(`${pad}${strip(name).padEnd(20 - indent * 2)} ${strip(desc)}`)
    if (node.children) printTree(node.children, indent + 1)
  }
}
const printCommandHelp = (path: string[], cmd: ManifestCommand): void => {
  console.log(`${strip(cmd.description)}\n`)
  const required = cmd.args.filter(a => a.required)
  const optional = cmd.args.filter(a => !a.required)
  const reqStr = required.map(a => `${a.name} <${a.type}>`).join(' ')
  const optStr = optional.map(a => `[${a.name} <${a.type}>]`).join(' ')
  console.log(`Usage: ${path.join(' ')} ${reqStr} ${optStr}`.trim())
  console.log('')
  for (const a of cmd.args) {
    const enumPart = a.enum ? ` (${a.enum.join('|')})` : ''
    const reqPart = a.required ? '' : ' [optional]'
    const constraints: string[] = []
    if (a.pattern) constraints.push(`regex=${a.pattern}`)
    if (a.minLength !== undefined) constraints.push(`minLen=${a.minLength}`)
    if (a.maxLength !== undefined) constraints.push(`maxLen=${a.maxLength}`)
    if (a.min !== undefined) constraints.push(`min=${a.min}`)
    if (a.max !== undefined) constraints.push(`max=${a.max}`)
    if (a.integer) constraints.push('integer')
    if (a.aliases && a.aliases.length > 0) constraints.push(`aliases=${a.aliases.join(',')}`)
    const constraintStr = constraints.length > 0 ? ` [${constraints.join(' ')}]` : ''
    console.log(`  ${a.name.padEnd(24)} ${strip(a.description)}${enumPart}${reqPart}${constraintStr}`)
  }
  if (cmd.examples.length > 0) {
    console.log('\nExamples:')
    for (const ex of cmd.examples) console.log(`  ${strip(ex)}`)
  }
  console.log(`\ncost: ${cmd.cost}  deterministic: ${cmd.deterministic}`)
  if (cmd.errorCodes.length > 0) console.log(`errors: ${cmd.errorCodes.join(', ')}`)
}
const errorExit = (
  kind: 'auth' | 'input' | 'permanent' | 'transient' | 'unknown' | 'upstream',
  payload: unknown
): never => {
  console.error(JSON.stringify(payload, null, 2))
  const code = { auth: 5, input: 2, permanent: 4, transient: 3, unknown: 1, upstream: 6 }[kind] ?? 1
  process.exit(code)
}
const coerceArgs = (cmd: ManifestCommand, flagArgs: Record<string, string>): Record<string, unknown> => {
  const argTypes = new Map(cmd.args.map(a => [a.name.slice(2), a.type]))
  const aliasMap = new Map<string, string>()
  for (const a of cmd.args) for (const al of a.aliases ?? []) aliasMap.set(al.slice(2), a.name.slice(2))
  const out: Record<string, unknown> = {}
  for (const [rawK, val] of Object.entries(flagArgs)) {
    const k = aliasMap.get(rawK) ?? rawK
    const t = argTypes.get(k)
    if (t === 'number') {
      const n = Number(val)
      out[k] = Number.isNaN(n) ? val : n
    } else if (t === 'boolean') out[k] = val === 'true'
    else out[k] = val
  }
  return out
}
const rejectUnknownFlag = (cmd: ManifestCommand, coerced: Record<string, unknown>): void => {
  const knownNames = new Set(cmd.args.map(a => a.name.slice(2)))
  for (const k of Object.keys(coerced))
    if (!knownNames.has(k)) {
      const guess = didYouMean(k, [...knownNames])
      console.error(
        JSON.stringify({
          error: {
            category: 'input',
            code: 'INVALID_ARG',
            details: {
              offending: `--${k}`,
              suggested: guess ? `--${guess}` : null,
              valid_flags: cmd.args.map(a => a.name)
            },
            message: `unknown flag: --${k}`,
            retryable: false
          }
        })
      )
      process.exit(2)
    }
}
const printProviderIndex = (manifest: Manifest): void => {
  const providerKeys = Object.keys(manifest.tree).toSorted()
  console.log('Providers (each installed as a top-level binary):')
  for (const k of providerKeys) {
    const p = manifest.tree[k]
    console.log(`  ${k}${p?.description ? `  —  ${p.description}` : ''}`)
  }
  console.log("\nRun `<provider> --help` to list that provider's commands.")
  console.log('Run `<provider> <command> --help` for command usage.')
}
const walkCommandPath = (manifest: Manifest, argv: string[]): { consumed: number; path: string[] } => {
  const path: string[] = []
  let consumed = 0
  for (let i = 0; i < argv.length; i += 1) {
    const tok = argv[i] ?? ''
    if (tok === '--' || tok === '--help' || tok === '-h' || tok.startsWith('--') || tok.startsWith('-')) break
    if (!KEBAB_RE.test(tok)) break
    const probe = walkPathInTree(manifest.tree, [...path, tok])
    if (!probe) break
    path.push(tok)
    consumed = i + 1
    if (probe.kind === 'command') break
  }
  return { consumed, path }
}
const PROVIDER_PREFIX_RE = /^_/u
const handleUnknownPath = (manifest: Manifest, path: string[]): never => {
  let parent: ManifestNode | null = null
  let validUpTo = 0
  for (let i = path.length - 1; i >= 0; i -= 1) {
    const p = walkPathInTree(manifest.tree, path.slice(0, i))
    if (p) {
      parent = p
      validUpTo = i
      break
    }
  }
  const candidates = parent?.children ? Object.keys(parent.children) : Object.keys(manifest.tree)
  const offending = path[validUpTo] ?? ''
  const guess = didYouMean(offending, candidates)
  console.error(
    JSON.stringify(
      {
        error: {
          category: 'input',
          code: 'NOT_FOUND',
          details: { suggested: guess, valid_children: candidates, valid_path: path.slice(0, validUpTo) },
          message: `unknown path: ${path.join(' ')}`,
          retryable: false
        }
      },
      null,
      2
    )
  )
  process.exit(2)
}
const DOCS_CACHE_DIR = process.env.DOCS_CACHE_DIR ?? '/home/agent/.docs-cache'
const DOC_ID_RE = /^[a-z0-9]{20,64}$/u
interface DocsReadResponse {
  body?: unknown
  doc_id?: unknown
}
const materializeDocsReadIfApplicable = (path: string[], data: unknown): unknown => {
  if (path.length !== 2 || path[0] !== 'docs' || path[1] !== 'read') return data
  if (data === null || typeof data !== 'object') return data
  const d = data as DocsReadResponse & Record<string, unknown>
  const body = typeof d.body === 'string' ? d.body : null
  const docId = typeof d.doc_id === 'string' ? d.doc_id : null
  if (body === null || docId === null || !DOC_ID_RE.test(docId)) return data
  // oxlint-disable-next-line node/no-sync
  mkdirSync(DOCS_CACHE_DIR, { recursive: true })
  const filePath = join(DOCS_CACHE_DIR, `${docId}.md`)
  // oxlint-disable-next-line node/no-sync
  writeFileSync(filePath, body, 'utf8')
  const rest: Record<string, unknown> = {}
  for (const [k, val] of Object.entries(d)) if (k !== 'body') rest[k] = val
  return { ...rest, path: filePath }
}
const runCommand = async (path: string[], cmd: ManifestCommand, flagTokens: string[]): Promise<void> => {
  const { args: flagArgs, positional } = parseFlags(flagTokens)
  const sole = cmd.args.filter(a => a.required).length === 1 ? cmd.args.find(a => a.required) : undefined
  if (positional.length > 0 && sole) flagArgs[sole.name.slice(2)] = positional.join(' ')
  else if (positional.length > 0) {
    console.error(
      JSON.stringify({
        error: {
          category: 'input',
          code: 'INVALID_ARG',
          details: { positional },
          message: 'unexpected positional args; use named flags',
          retryable: false
        }
      })
    )
    process.exit(2)
  }
  const coerced = coerceArgs(cmd, flagArgs)
  rejectUnknownFlag(cmd, coerced)
  const chatId = process.env.CLI_SESSION_ID
  const r = await call('/api/cli/exec', chatId ? { args: coerced, chatId, path } : { args: coerced, path })
  if (r.status === 200) {
    const out = materializeDocsReadIfApplicable(path, r.data)
    console.log(JSON.stringify(out, null, 2))
    return
  }
  const errBody = r.data as null | { error?: { category?: string; code?: string; message?: string } }
  const cat = errBody?.error?.category
  if (typeof cat === 'string' && ['auth', 'input', 'permanent', 'transient', 'upstream'].includes(cat))
    errorExit(cat as 'auth' | 'input' | 'permanent' | 'transient' | 'upstream', r.data)
  errorExit('unknown', r.data ?? { error: { code: 'UNKNOWN', message: `HTTP ${r.status}` } })
}
const main = async (): Promise<void> => {
  const manifest = await fetchManifest()
  const providerBinaries = new Set(Object.keys(manifest.tree).map(p => p.replace(PROVIDER_PREFIX_RE, '')))
  const invoked = (process.argv[1] ?? '').split('/').pop() ?? ''
  const invokedBinary = invoked.endsWith('.mjs') ? invoked.slice(0, -4) : invoked
  const alias = providerBinaries.has(invokedBinary) ? invokedBinary : null
  const providerKey = alias
    ? (Object.keys(manifest.tree).find(k => k.replace(PROVIDER_PREFIX_RE, '') === alias) ?? alias)
    : null
  const argv = providerKey ? [providerKey, ...process.argv.slice(2)] : process.argv.slice(2)
  const isHelp = argv.includes('--help') || argv.includes('-h')
  const { path, consumed } = walkCommandPath(manifest, argv)
  const flagTokens = argv.slice(consumed).filter(t => t !== '--help' && t !== '-h' && t !== '--')
  if (path.length === 0) {
    printProviderIndex(manifest)
    return
  }
  const node = walkPathInTree(manifest.tree, path)
  if (!node) {
    handleUnknownPath(manifest, path)
    return
  }
  if (node.kind !== 'command') {
    if (isHelp || flagTokens.length === 0) {
      console.log(`${path.join(' ')} — ${node.description ?? ''}`)
      console.log('')
      if (node.children) printTree(node.children)
      return
    }
    console.error(
      JSON.stringify({
        error: { category: 'input', code: 'INVALID_ARG', message: `${path.join(' ')} is a group; specify a command` }
      })
    )
    process.exit(2)
  }
  const cmd = node.command
  if (!cmd) {
    console.error(
      JSON.stringify({
        error: { category: 'input', code: 'NOT_FOUND', message: 'node has kind=command but no command data' }
      })
    )
    process.exit(2)
  }
  if (isHelp) {
    printCommandHelp(path, cmd)
    return
  }
  await runCommand(path, cmd, flagTokens)
}
try {
  await main()
} catch (error: unknown) {
  console.error(`fatal: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
