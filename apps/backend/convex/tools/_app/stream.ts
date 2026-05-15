/* oxlint-disable unicorn/prefer-ternary */
/** biome-ignore-all lint/suspicious/useAwait: Convex httpAction handler signature */
/** biome-ignore-all lint/performance/noAwaitInLoops: polling + sequential delete loops are intentional */
/** biome-ignore-all lint/style/noProcessEnv: ALLOW_DEV_TOKENS env gate */
/** biome-ignore-all lint/nursery/noUndeclaredEnvVars: dev gate env */
/* eslint-disable no-await-in-loop, complexity, max-depth */
import type { FunctionReference } from 'convex/server'
import {
  errorRes,
  findCommand,
  jsonRes,
  makeError,
  newTraceId,
  parsePath,
  snakeArgs,
  toDispatchError,
  validateArgs
} from '@a/cli'
import { v } from 'convex/values'
import type { Doc } from '../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../_generated/server'
import { internal } from '../../_generated/api'
import { httpAction, internalMutation, internalQuery } from '../../_generated/server'
import { hashSecret } from '../../secretHash'
import { REGISTRY } from '../generated/registry'
import { MENTION_RE } from './mentionResolver'
const CLI_STREAM_TTL_MS = 60 * 60 * 1000
const POLL_INTERVAL_MS = 200
const POLL_TIMEOUT_MS = 5 * 60 * 1000
const ID_ARG_RE = /id$/iu
const findCliStreamSince = async (ctx: QueryCtx, runId: string, afterSeq: number): Promise<Doc<'cliStreamEvents'>[]> =>
  ctx.db
    .query('cliStreamEvents')
    .withIndex('by_run_seq', q => q.eq('runId', runId).gt('seq', afterSeq))
    .collect()
const appendCliStream = internalMutation({
  args: { content: v.string(), runId: v.string(), seq: v.number(), terminal: v.boolean(), userId: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert('cliStreamEvents', {
      content: args.content,
      expiresAt: Date.now() + CLI_STREAM_TTL_MS,
      runId: args.runId,
      seq: args.seq,
      terminal: args.terminal,
      userId: args.userId
    })
  }
})
const sinceCliStream = internalQuery({
  args: { afterSeq: v.number(), runId: v.string() },
  handler: async (ctx, { runId, afterSeq }) => {
    const rows = await findCliStreamSince(ctx, runId, afterSeq)
    rows.sort((a, b) => a.seq - b.seq)
    return rows.map(r => ({ content: r.content, seq: r.seq, terminal: r.terminal }))
  }
})
const pruneCliStream = internalMutation({
  args: {},
  handler: async (ctx: MutationCtx) => {
    const now = Date.now()
    const old = await ctx.db
      .query('cliStreamEvents')
      .withIndex('by_expires', q => q.lt('expiresAt', now))
      .take(500)
    for (const row of old) await ctx.db.delete(row._id)
    if (old.length === 500) await ctx.scheduler.runAfter(1000, internal.tools._app.stream.pruneCliStream, {})
    return { deleted: old.length }
  }
})
const sleep = async (ms: number): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, ms)
  })
const streamHttp = httpAction(async (ctx, req) => {
  let body: { runId?: string }
  try {
    body = (await req.json()) as { runId?: string }
  } catch {
    return errorRes({ code: 'INVALID_ARG', message: 'invalid JSON body', status: 400 })
  }
  const runId = body.runId ?? ''
  if (!runId) return errorRes({ code: 'INVALID_ARG', message: 'runId required', status: 400 })
  const encoder = new TextEncoder()
  const deadline = Date.now() + POLL_TIMEOUT_MS
  const reader = new ReadableStream({
    start: async controller => {
      let lastSeq = -1
      let done = false
      while (!done && Date.now() < deadline) {
        const rows = await ctx.runQuery(internal.tools._app.stream.sinceCliStream, { afterSeq: lastSeq, runId })
        for (const row of rows) {
          controller.enqueue(encoder.encode(`${row.content}\n`))
          lastSeq = row.seq
          if (row.terminal) {
            done = true
            break
          }
        }
        if (!done) await sleep(POLL_INTERVAL_MS)
      }
      if (!done)
        controller.enqueue(encoder.encode(`${JSON.stringify({ kind: 'failed', reason: 'stream poll timeout' })}\n`))
      controller.close()
    }
  })
  return new Response(reader, {
    headers: { 'cache-control': 'no-store', 'content-type': 'application/x-ndjson; charset=utf-8' }
  })
})
interface ResolvedStreamAuth {
  mode: string
  owner: string
  tier: 'admin' | 'user'
}
const resolveStreamAuth = async (
  ctx: Parameters<Parameters<typeof httpAction>[0]>[0],
  bearer: string
): Promise<null | ResolvedStreamAuth> => {
  const allowDev = process.env.ALLOW_DEV_TOKENS === '1'
  if (allowDev && bearer.startsWith('dev-')) {
    const owner = bearer.slice('dev-'.length).trim()
    if (!owner) return null
    return { mode: 'dev', owner, tier: 'user' }
  }
  const tokenHash = await hashSecret(bearer)
  const row = await ctx.runQuery(internal.tools._app.cliAuth.cliTokenLookup, { tokenHash })
  if (!row) return null
  return { mode: 'token', owner: row.userId, tier: 'user' }
}
type WrappedResult = { error: unknown; ok: false } | { ok: true; result: unknown }
const execStreamHttp = httpAction(async (ctx, req) => {
  const authHeader = req.headers.get('Authorization') ?? ''
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!bearer) return errorRes({ code: 'UNAUTHORIZED', message: 'Bearer required', status: 401 })
  const ct = req.headers.get('Content-Type') ?? ''
  if (!ct.includes('application/json'))
    return errorRes({ code: 'INVALID_ARG', message: 'Content-Type must be application/json', status: 400 })
  let body: { args?: Record<string, unknown>; path?: unknown }
  try {
    body = (await req.json()) as { args?: Record<string, unknown>; path?: unknown }
  } catch {
    return errorRes({ code: 'INVALID_ARG', message: 'invalid JSON body', status: 400 })
  }
  const auth = await resolveStreamAuth(ctx, bearer)
  if (!auth) return errorRes({ code: 'UNAUTHORIZED', message: 'invalid bearer', status: 401 })
  const path = parsePath(body.path)
  if (path instanceof Response) return path
  const entry = findCommand(REGISTRY, path)
  if (!entry)
    return jsonRes(404, { error: makeError({ code: 'NOT_FOUND', message: `unknown command: ${path.join(' ')}` }) })
  if (entry.tier === 'admin' && auth.tier !== 'admin')
    return jsonRes(403, { error: makeError({ code: 'FORBIDDEN', message: 'admin-tier command' }) })
  const checked = validateArgs(entry.argSpecs, snakeArgs(body.args ?? {}))
  if (!checked.ok)
    return jsonRes(400, { error: makeError({ code: 'INVALID_ARG', details: checked.details, message: checked.message }) })
  for (const [key, value] of Object.entries(checked.coerced))
    if (typeof value === 'string' && value.startsWith('@')) {
      const m = MENTION_RE.exec(value)
      if (m?.groups) {
        const bareName = m.groups.name ?? ''
        if (ID_ARG_RE.test(key)) {
          const resolved = await ctx.runQuery(internal.tools._app.mentionResolver.resolveMention, {
            mention: value,
            userId: auth.owner
          })
          if (!resolved)
            return jsonRes(400, { error: makeError({ code: 'INVALID_ARG', message: `unknown mention kind: ${value}` }) })
          if (resolved._id === null)
            return jsonRes(404, {
              error: makeError({ code: 'NOT_FOUND', message: `no such @${resolved.kind}:${resolved.name}` })
            })
          checked.coerced[key] = resolved._id
        } else checked.coerced[key] = bareName
      }
    }
  const runId = `r_${crypto.randomUUID().replaceAll('-', '')}`
  const traceId = newTraceId()
  const encoder = new TextEncoder()
  const reader = new ReadableStream({
    start: async controller => {
      const emit = (payload: Record<string, unknown>): void => {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`))
      }
      emit({ kind: 'started', runId, traceId })
      let result: WrappedResult
      try {
        const toolArgs = {
          ...checked.coerced,
          authCtx: { mode: auth.mode, owner: auth.owner, tier: auth.tier },
          pathCtx: entry.path.join('.'),
          traceCtx: traceId
        }
        const fn = entry.fn as FunctionReference<
          'action' | 'mutation' | 'query',
          'internal',
          Record<string, unknown>,
          WrappedResult
        >
        if (entry.kind === 'action') result = await ctx.runAction(fn as never, toolArgs as never)
        else if (entry.kind === 'mutation') result = await ctx.runMutation(fn as never, toolArgs as never)
        else result = await ctx.runQuery(fn as never, toolArgs as never)
      } catch (error) {
        result = { error: toDispatchError(error), ok: false }
      }
      const wrapped = result as WrappedResult
      const terminal: Record<string, unknown> = wrapped.ok
        ? { kind: 'complete', result: wrapped.result, runId }
        : { error: wrapped.error, kind: 'failed', runId }
      emit(terminal)
      controller.close()
    }
  })
  return new Response(reader, {
    headers: { 'cache-control': 'no-store', 'content-type': 'application/x-ndjson; charset=utf-8' }
  })
})
export { appendCliStream, execStreamHttp, pruneCliStream, sinceCliStream, streamHttp }
