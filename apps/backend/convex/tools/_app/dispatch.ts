/** biome-ignore-all lint/performance/noAwaitInLoops: sequential DB deletes */
/* eslint-disable no-await-in-loop, complexity */
import type { DispatchError, RegistryEntry } from '@a/cli'
/* oxlint-disable eslint(no-await-in-loop), eslint(complexity) */
import type { FunctionReference } from 'convex/server'
import {
  buildTree,
  errorRes,
  findCommand,
  findValidPath,
  jsonRes,
  makeError,
  newTraceId,
  parsePath,
  snakeArgs,
  toDispatchError,
  validateArgs
} from '@a/cli'
import { v } from 'convex/values'
import type { Id } from '../../_generated/dataModel'
import type { ActionCtx } from '../../_generated/server'
import type { ResolvedAuth } from './auth'
import { internal } from '../../_generated/api'
import { httpAction, internalMutation, internalQuery } from '../../_generated/server'
import { optionalEnv } from '../../env'
import { hashSecret } from '../../secretHash'
import { constantTimeEqual, log } from '../../utils'
import { PROVIDERS, REGISTRY } from '../generated/registry'
import { cliTokenAuth } from './cliAuth'
import { MENTION_RE } from './mentionResolver'
const ID_ARG_RE = /id$/iu
const visibleToTier = (tier: ResolvedAuth['tier']) => (entry: RegistryEntry) => {
  if (tier === 'admin') return true
  if (entry.tier === 'admin') return false
  const provider = entry.path[0]
  if (!provider) return false
  const meta = PROVIDERS[provider] ?? PROVIDERS[`_${provider}`]
  return meta?.enabled ?? true
}
const buildFilteredRegistry = (tier: ResolvedAuth['tier']): Record<string, RegistryEntry> => {
  const predicate = visibleToTier(tier)
  const out: Record<string, RegistryEntry> = {}
  for (const [k, entry] of Object.entries(REGISTRY)) if (predicate(entry)) out[k] = entry
  return out
}
const FILTERED_REGISTRY_ADMIN = buildFilteredRegistry('admin')
const filteredRegistry = (tier: ResolvedAuth['tier']): Record<string, RegistryEntry> =>
  tier === 'admin' ? FILTERED_REGISTRY_ADMIN : buildFilteredRegistry(tier)
const TRACE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const RATE_MAX_USER = 60
const RATE_MAX_ADMIN = 600
interface AuthBody {
  secret?: string
  sessionId?: string
}
type Ctx = Parameters<Parameters<typeof httpAction>[0]>[0]
interface ExecBody extends AuthBody {
  args?: Record<string, unknown>
  chatId?: string
  contextToken?: string
  path?: unknown
}
const BUSY_BYPASS = new Set<string>()
type FnRef = FunctionReference<'action' | 'mutation' | 'query', 'internal', Record<string, unknown>, WrappedResult>
interface MentionResolveErr {
  code: 'INVALID_ARG' | 'NOT_FOUND'
  message: string
  status: number
}
type MentionResolveResult = null | { coerced: string; ok: true } | { err: MentionResolveErr; ok: false }
interface ResolveMentionOpts {
  auth: ResolvedAuth
  ctx: Ctx
  key: string
  value: string
}
interface TraceArgs {
  args: Record<string, unknown>
  auth: ResolvedAuth
  ctx: Ctx
  durationMs: number
  path: string[]
  result: WrappedResult
  traceId: string
}
type WrappedResult = { error: DispatchError; ok: false } | { ok: true; result: unknown }
const resolveOneMention = async ({ ctx, auth, key, value }: ResolveMentionOpts): Promise<MentionResolveResult> => {
  if (!value.startsWith('@')) return null
  const m = MENTION_RE.exec(value)
  if (!m?.groups) return null
  const bareName = m.groups.name ?? ''
  if (!ID_ARG_RE.test(key)) return { coerced: bareName, ok: true }
  const resolved = await ctx.runQuery(internal.tools._app.mentionResolver.resolveMention, {
    mention: value,
    userId: auth.owner
  })
  if (!resolved) return { err: { code: 'INVALID_ARG', message: `unknown mention kind: ${value}`, status: 400 }, ok: false }
  if (resolved._id === null)
    return {
      err: { code: 'NOT_FOUND', message: `no such @${resolved.kind}:${resolved.name}`, status: 404 },
      ok: false
    }
  return { coerced: resolved._id, ok: true }
}
const statusForError = (err: DispatchError): number => {
  if (err.code === 'UNAUTHORIZED') return 401
  if (err.code === 'FORBIDDEN') return 403
  if (err.code === 'NOT_FOUND') return 404
  if (err.code === 'RATE_LIMITED') return 429
  if (err.code === 'TIMEOUT') return 504
  if (err.category === 'upstream') return 502
  if (err.category === 'transient') return 503
  if (err.category === 'auth') return 401
  if (err.category === 'input') return 400
  return 500
}
const hashKeyOwner = async (key: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))
  const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
  return `token-${hex.slice(0, 32)}`
}
const devTokenAuth = (req: Request): null | ResolvedAuth => {
  const allowDev = optionalEnv<{ ALLOW_DEV_TOKENS?: string }>().ALLOW_DEV_TOKENS ?? ''
  if (allowDev !== '1') return null
  const authHeader = req.headers.get('Authorization') ?? ''
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!bearer.startsWith('dev-')) return null
  const owner = bearer.slice('dev-'.length).trim()
  if (!owner) return null
  return { mode: 'dev', owner, tier: 'user' }
}
const apiKeyAuth = async (req: Request): Promise<null | ResolvedAuth> => {
  const authHeader = req.headers.get('Authorization') ?? ''
  const bearerKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  const apiKey = req.headers.get('X-Api-Key') ?? bearerKey
  const expectedKey = optionalEnv<{ X_API_KEY?: string }>().X_API_KEY ?? ''
  if (!(apiKey && expectedKey && constantTimeEqual(apiKey, expectedKey))) return null
  return { mode: 'token', owner: await hashKeyOwner(apiKey), tier: 'user' }
}
const sandboxAuth = async (ctx: Ctx, body: AuthBody): Promise<null | ResolvedAuth> => {
  if (!(body.sessionId && body.secret)) return null
  const r = await ctx.runQuery(internal.tools._app.dispatch.verifySandbox, {
    secret: body.secret,
    sessionId: body.sessionId
  })
  if (!r.ok) return null
  return { mode: 'sandbox', owner: r.owner, tier: 'user' }
}
const sameOrigin = (originRaw: string, siteUrl: string): boolean => {
  try {
    const reqOrigin = new URL(originRaw).origin.toLowerCase()
    return siteUrl.split(',').some(s => {
      try {
        return new URL(s.trim()).origin.toLowerCase() === reqOrigin
      } catch {
        return false
      }
    })
  } catch {
    return false
  }
}
const checkIdentityCsrf = (req: Request): null | Response => {
  // biome-ignore lint/style/noProcessEnv: SITE_URL guard for CSRF same-origin check
  // biome-ignore lint/nursery/noUndeclaredEnvVars: SITE_URL absence = test context (pm4ai check enforces presence at deploy)
  const siteUrl = process.env.SITE_URL ?? ''
  if (!siteUrl) return null
  const xrw = req.headers.get('x-requested-by')
  const originRaw = req.headers.get('origin') ?? req.headers.get('referer') ?? ''
  if (originRaw && sameOrigin(originRaw, siteUrl) && xrw) return null
  return errorRes({
    code: 'FORBIDDEN',
    message: 'identity auth requires same-origin Origin/Referer plus X-Requested-By',
    status: 403
  })
}
const tryGetIdentity = async (ctx: Ctx): Promise<Awaited<ReturnType<typeof ctx.auth.getUserIdentity>> | null> => {
  try {
    return await ctx.auth.getUserIdentity()
  } catch {
    return null
  }
}
const resolveAuth = async (opts: { body: AuthBody; ctx: Ctx; req: Request }): Promise<ResolvedAuth | Response> => {
  const identity = await tryGetIdentity(opts.ctx)
  if (identity?.issuer === 'x-cli') {
    const csrfRes = checkIdentityCsrf(opts.req)
    if (csrfRes) return csrfRes
    return { mode: 'admin', owner: 'admin', tier: 'admin' }
  }
  if (identity) {
    const csrfRes = checkIdentityCsrf(opts.req)
    if (csrfRes) return csrfRes
    return { mode: 'token', owner: identity.subject, tier: 'user' }
  }
  const dev = devTokenAuth(opts.req)
  if (dev) return dev
  const cli = await cliTokenAuth(opts.ctx as ActionCtx, opts.req)
  if (cli) return cli
  const api = await apiKeyAuth(opts.req)
  if (api) return api
  const sandbox = await sandboxAuth(opts.ctx, opts.body)
  if (sandbox) return sandbox
  return errorRes({ code: 'UNAUTHORIZED', message: 'no valid credentials', status: 401 })
}
const checkRate = async (ctx: Ctx, owner: string, tier: 'admin' | 'user'): Promise<boolean> => {
  const max = tier === 'admin' ? RATE_MAX_ADMIN : RATE_MAX_USER
  const ok = await ctx.runMutation(internal.lib.checkRateLimit, { max, owner: `x:${tier}:${owner}` })
  return ok
}
const callTool = async (opts: {
  args: Record<string, unknown>
  ctx: Ctx
  fn: FnRef
  kind: 'action' | 'mutation' | 'query'
}): Promise<WrappedResult> => {
  let promise: Promise<WrappedResult>
  if (opts.kind === 'mutation')
    promise = opts.ctx.runMutation(
      opts.fn as FunctionReference<'mutation', 'internal', Record<string, unknown>, WrappedResult>,
      opts.args
    )
  else if (opts.kind === 'query')
    promise = opts.ctx.runQuery(
      opts.fn as FunctionReference<'query', 'internal', Record<string, unknown>, WrappedResult>,
      opts.args
    )
  else
    promise = opts.ctx.runAction(
      opts.fn as FunctionReference<'action', 'internal', Record<string, unknown>, WrappedResult>,
      opts.args
    )
  const result = await promise
  return result
}
const parseExecBody = async (req: Request): Promise<ExecBody | Response> => {
  const ct = req.headers.get('Content-Type') ?? ''
  if (!ct.includes('application/json'))
    return errorRes({ code: 'INVALID_ARG', message: 'Content-Type must be application/json', status: 400 })
  const text = await req.text()
  if (text.length > 200_000) return errorRes({ code: 'INVALID_ARG', message: 'body too large', status: 413 })
  try {
    return JSON.parse(text) as ExecBody
  } catch {
    return errorRes({ code: 'INVALID_ARG', message: 'invalid JSON body', status: 400 })
  }
}
const REDACT_KEY_RE =
  /(?:password|\bsecret\b|\btoken\b|api[_-]?key|authorization|cookie|access[_-]?token|refresh[_-]?token|\bcard\b|\bssn\b|\bphone\b|\bpassport\b|\blicense\b|bearer|\bemail\b|credentials?)/iu
const REDACT_COMBINED_RE =
  /(?<email>[\w.+-]+@[\w-]+\.[\w.-]+)|(?<ssn>(?<!\d)\d{3}-\d{2}-\d{4}(?!\d))|(?<skant>sk-ant-[^\s"]{8,})|(?<e2b>\be2b_[A-Za-z0-9_-]{8,})|(?<jwt>eyJ[A-Za-z0-9._-]{20,})/giu
const redactValueEmails = (s: string): string =>
  s.replaceAll(REDACT_COMBINED_RE, (_m, email?: string, ssn?: string) => {
    if (email) return '[EMAIL]'
    if (ssn) return '[SSN]'
    return '[REDACTED]'
  })
const redactArgsForAudit = (val: unknown, depth = 0): unknown => {
  if (depth > 10) return '[TRUNCATED]'
  if (typeof val === 'string') return redactValueEmails(val)
  if (val === null || typeof val !== 'object') return val
  if (Array.isArray(val)) return val.map(v0 => redactArgsForAudit(v0, depth + 1))
  const out: Record<string, unknown> = {}
  for (const [k, v0] of Object.entries(val as Record<string, unknown>))
    out[k] = REDACT_KEY_RE.test(k) ? '[REDACTED]' : redactArgsForAudit(v0, depth + 1)
  return out
}
const writeTrace = async (opts: TraceArgs): Promise<void> => {
  const steps = 'steps' in opts.result ? opts.result.steps : []
  const redactedArgs = JSON.stringify(redactArgsForAudit(opts.args) ?? {}).slice(0, 4000)
  await Promise.all([
    opts.ctx.runMutation(internal.tools._app.dispatch.recordTrace, {
      args: redactedArgs,
      command: opts.path.join('.'),
      durationMs: opts.durationMs,
      error: opts.result.ok ? undefined : JSON.stringify(opts.result.error).slice(0, 4000),
      inputsResolved: undefined,
      mode: opts.auth.mode,
      ok: opts.result.ok,
      owner: opts.auth.owner,
      steps: JSON.stringify(redactArgsForAudit(steps) ?? []).slice(0, 16_000),
      traceId: opts.traceId
    }),
    opts.ctx.runMutation(internal.lib.insertAuditLog, {
      args: redactedArgs,
      command: opts.path.join('.'),
      mode: opts.auth.mode,
      ok: opts.result.ok,
      owner: opts.auth.owner
    })
  ])
}
const verifySandbox = internalQuery({
  args: { secret: v.string(), sessionId: v.string() },
  handler: async (ctx, { sessionId, secret }): Promise<{ ok: boolean; owner: string }> => {
    let chat: Awaited<ReturnType<typeof ctx.db.get<'chats'>>>
    try {
      chat = await ctx.db.get(sessionId as Id<'chats'>)
    } catch {
      return { ok: false, owner: '' }
    }
    if (!(chat?.secretHash && chat.streaming)) return { ok: false, owner: '' }
    const provided = await hashSecret(secret)
    if (!constantTimeEqual(chat.secretHash, provided)) return { ok: false, owner: '' }
    return { ok: true, owner: chat.owner }
  }
})
const pruneExpiredTraces = internalMutation({
  args: {},
  handler: async ctx => {
    const now = Date.now()
    const old = await ctx.db
      .query('xTraces')
      .withIndex('by_expires', q => q.lt('expiresAt', now))
      .take(500)
    for (const row of old) await ctx.db.delete(row._id)
    if (old.length === 500) await ctx.scheduler.runAfter(1000, internal.tools._app.dispatch.pruneExpiredTraces, {})
    return { deleted: old.length }
  }
})
const recordTrace = internalMutation({
  args: {
    args: v.string(),
    command: v.string(),
    durationMs: v.number(),
    error: v.optional(v.string()),
    inputsResolved: v.optional(v.string()),
    mode: v.string(),
    ok: v.boolean(),
    owner: v.string(),
    steps: v.string(),
    traceId: v.string()
  },
  handler: async (ctx, row) => {
    await ctx.db.insert('xTraces', { ...row, expiresAt: Date.now() + TRACE_TTL_MS })
  }
})
const exec = httpAction(async (ctx, req) => {
  const body = await parseExecBody(req)
  if (body instanceof Response) return body
  const auth = await resolveAuth({ body, ctx, req })
  if (auth instanceof Response) return auth
  const earlyAllowed = await checkRate(ctx, auth.owner, auth.tier)
  if (!earlyAllowed) return errorRes({ code: 'RATE_LIMITED', message: 'rate limit exceeded', status: 429 })
  const path = parsePath(body.path)
  if (path instanceof Response) return path
  const entry = findCommand(REGISTRY, path)
  if (!entry || (entry.tier === 'admin' && auth.tier !== 'admin')) {
    const hint = auth.tier === 'admin' ? findValidPath(REGISTRY, path) : undefined
    return jsonRes(404, {
      error: makeError({ code: 'NOT_FOUND', details: hint, message: `unknown command: ${path.join(' ')}` })
    })
  }
  const deprecated = entry.meta.deprecated ?? undefined
  const errDep = (opts: Parameters<typeof errorRes>[0]): Response => {
    if (!deprecated) return errorRes(opts)
    return jsonRes(opts.status, {
      _deprecated: deprecated,
      error: makeError({ code: opts.code, details: opts.details, message: opts.message })
    })
  }
  const args = body.args ?? {}
  const checked = validateArgs(entry.argSpecs, snakeArgs(args))
  if (!checked.ok) return errDep({ code: 'INVALID_ARG', details: checked.details, message: checked.message, status: 400 })
  for (const [key, value] of Object.entries(checked.coerced))
    if (typeof value === 'string') {
      const r = await resolveOneMention({ auth, ctx, key, value })
      if (r && !r.ok) return errDep(r.err)
      if (r?.ok) checked.coerced[key] = r.coerced
    }
  for (const group of entry.meta.exclusive) {
    const present = group.filter(g => checked.coerced[g] !== undefined)
    if (present.length !== 1)
      return errDep({
        code: 'INVALID_ARG',
        details: { group, present },
        message:
          present.length === 0
            ? `exactly one of ${group.map(g => `--${g.replaceAll('_', '-')}`).join(' / ')} required`
            : `exactly one of ${group.map(g => `--${g.replaceAll('_', '-')}`).join(' / ')} allowed (got ${present.length})`,
        status: 400
      })
  }
  const traceId = newTraceId()
  if (deprecated)
    log('warn', 'x.deprecated', {
      command: path.join('.'),
      message: deprecated.message,
      replacedBy: deprecated.replacedBy
    })
  const isStatefulKind = entry.kind === 'action' || entry.kind === 'mutation'
  if (isStatefulKind && !BUSY_BYPASS.has(entry.path.join('.'))) {
    const userCtx = await ctx.runQuery(internal.userContexts.getByUser, { userId: auth.owner })
    if (userCtx) {
      if (
        body.contextToken !== undefined &&
        userCtx.activeContextToken &&
        userCtx.activeContextToken !== body.contextToken
      )
        return errDep({
          code: 'CONTEXT_STOLEN',
          details: { activeToken: userCtx.activeContextToken },
          message: 'this tab is no longer the active context; reclaim or refresh',
          status: 409
        })
      if (userCtx.busyUntil && userCtx.busyUntil > Date.now())
        return errDep({
          code: 'BUSY',
          details: { busyKind: userCtx.busyKind, busyUntil: userCtx.busyUntil },
          message: `another action is in flight (~${Math.round((userCtx.busyUntil - Date.now()) / 1000)}s remaining); type 'stop' to cancel`,
          status: 423
        })
    }
  }
  const t0 = Date.now()
  let result: WrappedResult
  try {
    result = await callTool({
      args: {
        ...checked.coerced,
        authCtx: auth,
        chatCtx: body.chatId,
        pathCtx: entry.path.join('.'),
        traceCtx: traceId
      },
      ctx,
      fn: entry.fn as FnRef,
      kind: entry.kind
    })
  } catch (error) {
    result = { error: toDispatchError(error), ok: false }
  }
  const durationMs = Date.now() - t0
  await writeTrace({ args, auth, ctx, durationMs, path, result, traceId })
  log('info', 'x.exec', { command: path.join('.'), durationMs, mode: auth.mode, ok: result.ok, owner: auth.owner })
  if (result.ok) {
    if (deprecated && result.result !== null && typeof result.result === 'object')
      return jsonRes(200, { ...(result.result as Record<string, unknown>), _deprecated: deprecated })
    return jsonRes(200, result.result)
  }
  return jsonRes(statusForError(result.error), {
    error: result.error,
    ...(deprecated ? { _deprecated: deprecated } : {}),
    traceId
  })
})
const manifestHttp = httpAction(async (ctx, req) => {
  let body: AuthBody = {}
  try {
    body = (await req.json()) as AuthBody
  } catch {
    //
  }
  const auth = await resolveAuth({ body, ctx, req })
  if (auth instanceof Response) return auth
  return jsonRes(200, { tree: buildTree({ providers: PROVIDERS, registry: filteredRegistry(auth.tier) }), version: 1 })
})
export { exec, manifestHttp, pruneExpiredTraces, recordTrace, verifySandbox }
