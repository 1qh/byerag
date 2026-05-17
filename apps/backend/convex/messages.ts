/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential Convex DB ops */
/* eslint-disable complexity, no-await-in-loop */
/* oxlint-disable eslint(no-await-in-loop), eslint(no-control-regex), eslint(complexity) */
import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import type { Id } from './_generated/dataModel'
import type { UsageReport } from './messages/streamHelpers'
import { internal } from './_generated/api'
import { httpAction, internalMutation, internalQuery, mutation, query } from './_generated/server'
import { getOwnerEmailOrNull, requireOwnerEmail } from './authHelpers'
import { resetEventCount, resetTurn, STREAM_EVENT_HARD_CAP } from './chatRuntime'
import { SEQ_SANDBOX_ERROR, SEQ_SERVER_ERROR, STREAMING_TIMEOUT_MS, VALID_CHATID_RE } from './constants'
import { env } from './env'
import { sanitizeForDisplay } from './lib'
import { completeBody, jsonErr, parseHttpBody, streamEventBody } from './messages/httpHelpers'
import {
  ANTHROPIC_PREFIX_RE,
  BEARER_RE,
  MAX_PROXY_BODY,
  parseProxyToken,
  SKIP_REQ_HEADERS,
  SKIP_RES_HEADERS
} from './messages/proxyHelpers'
import { sendCore, VALID_SESSION_ID, verifySecret } from './messages/sendCore'
import {
  boundedBody,
  computeActualCents,
  DEFAULT_RATES,
  MODEL_RATES,
  sseCostTap,
  withCancelHook
} from './messages/streamHelpers'
import { redactSecrets } from './redactor'
import { generateSecret, hashSecret } from './secretHash'
import { errorEventEnvelope } from './streamProtocol'
import { constantTimeEqual, log } from './utils'
const ANTHROPIC_VERSION_RE = /^\d{4}-\d{2}-\d{2}(?:-[a-z0-9]+)?$/u
const ALLOWED_UPSTREAM_PATHS = new Set(['/v1/messages', '/v1/messages/count_tokens'])
const TRAILING_SLASH_RE = /\/$/u
const STREAM_EVENTS_QUERY_PAGE = 500
const SEND_BUCKET_MAX = 30
const SEND_BUCKET_WINDOW_MS = 60_000
const send = mutation({
  args: {
    activeContextToken: v.optional(v.string()),
    app: v.string(),
    chatId: v.optional(v.id('chats')),
    content: v.string()
  },
  handler: async (ctx, { activeContextToken, app, chatId, content }) => {
    const email = await requireOwnerEmail(ctx)
    if (activeContextToken !== undefined) {
      const ctxRows = await ctx.db
        .query('userContexts')
        .withIndex('by_user', q => q.eq('userId', email))
        .collect()
      const ctxRow = ctxRows[0] ?? null
      if (ctxRow?.activeContextToken !== activeContextToken) throw new Error('activeContextToken mismatch')
    }
    // biome-ignore lint/nursery/noPlaywrightUselessAwait: Convex .first() returns thenable
    const rows = await ctx.db
      .query('rateLimits')
      .withIndex('by_owner', q => q.eq('owner', `send:${email}`))
      .first()
    const now = Date.now()
    if (rows?.tokens !== undefined && rows.refilledAt !== undefined) {
      const elapsed = Math.max(0, now - rows.refilledAt)
      const refilled = Math.min(SEND_BUCKET_MAX, rows.tokens + (elapsed * SEND_BUCKET_MAX) / SEND_BUCKET_WINDOW_MS)
      if (refilled < 1) throw new Error('send rate limit exceeded')
      await ctx.db.patch(rows._id, { refilledAt: now, tokens: refilled - 1, updatedAt: now })
    } else if (rows)
      await ctx.db.patch(rows._id, {
        refilledAt: now,
        timestamps: undefined,
        tokens: SEND_BUCKET_MAX - 1,
        updatedAt: now
      })
    else
      await ctx.db.insert('rateLimits', {
        owner: `send:${email}`,
        refilledAt: now,
        tokens: SEND_BUCKET_MAX - 1,
        updatedAt: now
      })
    const result = await sendCore(ctx, { app, chatId, content, email })
    return result.chatId
  },
  returns: v.id('chats')
})
const list = query({
  args: { chatId: v.id('chats'), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { chatId, paginationOpts }) => {
    const email = await getOwnerEmailOrNull(ctx)
    if (!email) return { continueCursor: '', isDone: true, page: [], pageStatus: undefined, splitCursor: undefined }
    const chat = await ctx.db.get(chatId)
    if (chat?.owner !== email || chat.deletedAt !== undefined)
      return { continueCursor: '', isDone: true, page: [], pageStatus: undefined, splitCursor: undefined }
    return ctx.db
      .query('messages')
      .withIndex('by_chat', q => q.eq('chatId', chatId))
      .order('desc')
      .paginate(paginationOpts)
  }
})
const streamEvents = query({
  args: { chatId: v.id('chats'), limit: v.optional(v.number()) },
  handler: async (ctx, { chatId, limit }) => {
    const email = await getOwnerEmailOrNull(ctx)
    if (!email) return []
    const chat = await ctx.db.get(chatId)
    if (chat?.owner !== email || chat.deletedAt !== undefined) return []
    const n = Math.min(limit ?? STREAM_EVENTS_QUERY_PAGE, STREAM_EVENTS_QUERY_PAGE)
    const rows = await ctx.db
      .query('streamEvents')
      .withIndex('by_chat', q => q.eq('chatId', chatId))
      .order('desc')
      .take(n)
    return rows.toSorted((a, b) => a.seq - b.seq)
  }
})
const KNOWN_EVENT_TYPES = new Set([
  'agent',
  'assistant',
  'error',
  'rate_limit_event',
  'result',
  'stream_event',
  'system',
  'user'
])
const extractEventType = (content: string): string | undefined => {
  try {
    const obj = JSON.parse(content) as { type?: unknown }
    const t = typeof obj.type === 'string' ? obj.type : undefined
    return t && KNOWN_EVENT_TYPES.has(t) ? t : undefined
  } catch {
    /* Malformed JSON — leave eventType undefined */
  }
}
const insertStreamEvent = internalMutation({
  args: {
    chatId: v.id('chats'),
    content: v.string(),
    secret: v.string(),
    seq: v.number()
  },
  handler: async (ctx, { chatId, content, seq, secret }) => {
    if (seq < 0 || seq > SEQ_SANDBOX_ERROR) throw new Error('invalid seq')
    await verifySecret(ctx, chatId, secret)
    const chat = await ctx.db.get(chatId)
    if (!chat?.streaming) throw new Error('chat not streaming')
    if (content.length > 120_000) throw new Error('event too large')
    // biome-ignore lint/nursery/noPlaywrightUselessAwait: Convex .first() returns thenable
    const dup = await ctx.db
      .query('streamEvents')
      .withIndex('by_chat_seq', q => q.eq('chatId', chatId).eq('seq', seq))
      .first()
    if (dup) throw new Error('duplicate seq')
    if (seq >= STREAM_EVENT_HARD_CAP) throw new Error('too many events')
    await ctx.db.insert('streamEvents', { chatId, content, seq })
  },
  returns: v.null()
})
const stripSecretsForProxyLog = (s: string): string => redactSecrets(s).replaceAll(env.KIMI_API_KEY, '[REDACTED]')
type MessageType = 'agent' | 'assistant' | 'error' | 'rate_limit_event' | 'result' | 'stream_event' | 'system' | 'user'
const KNOWN_MSG_TYPES = new Set<MessageType>([
  'agent',
  'assistant',
  'error',
  'rate_limit_event',
  'result',
  'stream_event',
  'system',
  'user'
])
const resolveBatchEventType = (e: { content: string }): MessageType | null => {
  const t = extractEventType(e.content)
  return t && KNOWN_MSG_TYPES.has(t as MessageType) ? (t as MessageType) : null
}
interface ProcessBatchArgs {
  byteAcc: { total: number }
  e: { content: string; seq: number }
  out: { content: string; seq: number; type: MessageType }[]
}
const processBatchEvent = ({ e, out, byteAcc }: ProcessBatchArgs): void => {
  const type = resolveBatchEventType(e)
  if (!type) return
  if (type === 'stream_event') return
  if (e.content.length > 500_000) throw new Error('message too large')
  byteAcc.total += e.content.length
  if (byteAcc.total > 10_000_000) throw new Error('complete payload too large')
  out.push({ content: e.content, seq: e.seq, type })
}
const complete = internalMutation({
  args: {
    chatId: v.id('chats'),
    secret: v.string(),
    sessionId: v.optional(v.string())
  },
  handler: async (ctx, { chatId, sessionId, secret }) => {
    await verifySecret(ctx, chatId, secret)
    const chat = await ctx.db.get(chatId)
    if (!chat) return
    if (!chat.streaming) throw new Error('chat not streaming')
    const byteAcc = { total: 0 }
    const COMPLETE_BATCH = 200
    const serialized: { content: string; seq: number; type: MessageType }[] = []
    const readNext = async (after: number) =>
      ctx.db
        .query('streamEvents')
        .withIndex('by_chat_seq', q =>
          after === Number.NEGATIVE_INFINITY ? q.eq('chatId', chatId) : q.eq('chatId', chatId).gt('seq', after)
        )
        .take(COMPLETE_BATCH)
    let lastSeq = Number.NEGATIVE_INFINITY
    for (;;) {
      const batch = await readNext(lastSeq)
      if (batch.length === 0) break
      lastSeq = batch.at(-1)?.seq ?? lastSeq
      for (const e of batch) processBatchEvent({ byteAcc, e, out: serialized })
      if (batch.length < COMPLETE_BATCH) break
    }
    serialized.sort((a, b) => a.seq - b.seq)
    const COMPLETE_INSERT_CAP = 2000
    const remaining = Math.max(0, 5000 - chat.messageCount)
    const insertCount = Math.min(serialized.length, COMPLETE_INSERT_CAP, remaining)
    const truncated = insertCount < serialized.length
    const startSeq = chat.messageCount
    for (let i = 0; i < insertCount; i += 1) {
      const row = serialized[i]
      if (row) await ctx.db.insert('messages', { chatId, content: row.content, seq: startSeq + i, type: row.type })
    }
    if (truncated)
      await ctx.db.insert('messages', {
        chatId,
        content: errorEventEnvelope(
          serialized.length > COMPLETE_INSERT_CAP
            ? 'truncated: too many messages this turn'
            : 'truncated: chat message cap reached'
        ),
        seq: startSeq + insertCount,
        type: 'error'
      })
    const seq = startSeq + insertCount + (truncated ? 1 : 0)
    const rotated = await hashSecret(generateSecret())
    if (chat.timeoutFunctionId)
      try {
        await ctx.scheduler.cancel(chat.timeoutFunctionId)
      } catch {
        /* Already fired */
      }
    for (;;) {
      const batch = await ctx.db
        .query('streamEvents')
        .withIndex('by_chat', q => q.eq('chatId', chatId))
        .take(500)
      if (batch.length === 0) break
      await Promise.all(batch.map(async e => ctx.db.delete(e._id)))
      if (batch.length < 500) break
    }
    await ctx.db.patch(chatId, {
      messageCount: seq,
      secretHash: rotated,
      streaming: false,
      timeoutFunctionId: undefined,
      updatedAt: Date.now(),
      ...(sessionId && VALID_SESSION_ID.test(sessionId) ? { sessionId } : {})
    })
    await resetTurn(ctx, chatId)
    await resetEventCount(ctx, chatId)
    if (sessionId && !VALID_SESSION_ID.test(sessionId))
      // eslint-disable-next-line no-console
      console.warn(JSON.stringify({ chatId, event: 'complete.invalid_session_id', level: 'warn' }))
  },
  returns: v.null()
})
const sendInternal = internalMutation({
  args: {
    app: v.string(),
    chatId: v.optional(v.id('chats')),
    content: v.string(),
    email: v.string()
  },
  handler: async (ctx, { app, email, chatId, content }) => {
    const r = await sendCore(ctx, { app, chatId, content, email })
    return r
  },
  returns: v.object({ chatId: v.id('chats'), secret: v.string() })
})
const streamEventsForLiveness = internalQuery({
  args: { chatId: v.id('chats') },
  handler: async (ctx, { chatId }) => {
    const rows = await ctx.db
      .query('streamEvents')
      .withIndex('by_chat_seq', q => q.eq('chatId', chatId).gte('seq', 0))
      .take(1)
    if (rows.length > 0) return [{ seq: rows[0]?.seq ?? 0 }]
    // biome-ignore lint/nursery/noPlaywrightUselessAwait: Convex .first() is thenable
    const recentAnyEvent = await ctx.db
      .query('streamEvents')
      .withIndex('by_chat', q => q.eq('chatId', chatId))
      .order('desc')
      .first()
    return recentAnyEvent ? [{ seq: recentAnyEvent.seq }] : []
  }
})
const lastUserMessage = internalQuery({
  args: { chatId: v.id('chats') },
  handler: async (ctx, { chatId }) =>
    ctx.db
      .query('messages')
      .withIndex('by_chat_type', q => q.eq('chatId', chatId).eq('type', 'user'))
      .order('desc')
      .first()
})
const insertAgentEvent = internalMutation({
  args: {
    chatId: v.id('chats'),
    content: v.string(),
    seq: v.number()
  },
  handler: async (ctx, { chatId, content, seq }) => {
    if (seq < -10_000 || seq > 100_000) throw new Error('invalid agent seq')
    if (content.length > 10_000) throw new Error('agent event too large')
    const chat = await ctx.db.get(chatId)
    if (!chat?.streaming) throw new Error('chat not streaming')
    // biome-ignore lint/nursery/noPlaywrightUselessAwait: Convex .first() returns thenable
    const dup = await ctx.db
      .query('streamEvents')
      .withIndex('by_chat_seq', q => q.eq('chatId', chatId).eq('seq', seq))
      .first()
    if (dup) throw new Error('duplicate seq')
    if (seq >= STREAM_EVENT_HARD_CAP) throw new Error('too many events')
    await ctx.db.insert('streamEvents', { chatId, content, seq })
  }
})
const insertError = internalMutation({
  args: {
    chatId: v.id('chats'),
    error: v.string()
  },
  handler: async (ctx, { chatId, error }) => {
    const chat = await ctx.db.get(chatId)
    if (!chat?.streaming) return
    const truncated = sanitizeForDisplay(error, 2000)
    const rotated = await hashSecret(generateSecret())
    if (chat.timeoutFunctionId)
      try {
        await ctx.scheduler.cancel(chat.timeoutFunctionId)
      } catch {
        /* Already fired */
      }
    await Promise.all([
      ctx.db.insert('streamEvents', {
        chatId,
        content: errorEventEnvelope(truncated),
        seq: SEQ_SERVER_ERROR
      }),
      ctx.db.patch(chatId, {
        secretHash: rotated,
        sessionId: undefined,
        streaming: false,
        timeoutFunctionId: undefined
      }),
      resetEventCount(ctx, chatId)
    ])
  }
})
const timeoutStreaming = internalMutation({
  args: { chatId: v.id('chats') },
  handler: async (ctx, { chatId }) => {
    const chat = await ctx.db.get(chatId)
    if (!chat?.streaming) return
    const elapsed = Date.now() - chat.streamingStartedAt
    if (elapsed < STREAMING_TIMEOUT_MS) return
    // biome-ignore lint/nursery/noPlaywrightUselessAwait: Convex .first() returns thenable
    const hasError = await ctx.db
      .query('streamEvents')
      .withIndex('by_chat_seq', q => q.eq('chatId', chatId).eq('seq', SEQ_SERVER_ERROR))
      .first()
    if (!hasError)
      await ctx.db.insert('streamEvents', {
        chatId,
        content: errorEventEnvelope('agent timed out'),
        seq: SEQ_SERVER_ERROR
      })
    const rotated = await hashSecret(generateSecret())
    await Promise.all([
      ctx.db.patch(chatId, {
        secretHash: rotated,
        sessionId: undefined,
        streaming: false,
        timeoutFunctionId: undefined
      }),
      resetEventCount(ctx, chatId)
    ])
  }
})
const streamEventHttp = httpAction(async (ctx, req) => {
  const body = await parseHttpBody(req)
  if (body instanceof Response) return body
  const parsed = streamEventBody.safeParse(body)
  if (!parsed.success) return jsonErr('invalid body', 400)
  if (!VALID_CHATID_RE.test(parsed.data.chatId)) return jsonErr('invalid chatId', 400)
  const ownerRes = await ctx.runQuery(internal.messages.verifyProxyToken, {
    chatId: parsed.data.chatId,
    secret: parsed.data.secret
  })
  if (!ownerRes) return jsonErr('invalid secret', 401)
  try {
    await ctx.runMutation(internal.messages.insertStreamEvent, {
      chatId: parsed.data.chatId as Id<'chats'>,
      content: parsed.data.content,
      secret: parsed.data.secret,
      seq: parsed.data.seq
    })
    return Response.json({ ok: true })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'error'
    if (msg === 'chat not streaming' || msg === 'too many events' || msg === 'event too large') return jsonErr(msg, 409)
    if (msg === 'duplicate seq') return jsonErr(msg, 409)
    if (msg === 'chatRuntime missing') return jsonErr(msg, 409)
    if (msg === 'unauthorized') return jsonErr(msg, 401)
    return jsonErr(msg, 400)
  }
})
const completeHttp = httpAction(async (ctx, req) => {
  const body = await parseHttpBody(req)
  if (body instanceof Response) return body
  const parsed = completeBody.safeParse(body)
  if (!parsed.success) return jsonErr('invalid body', 400)
  if (!VALID_CHATID_RE.test(parsed.data.chatId)) return jsonErr('invalid chatId', 400)
  const owner = await ctx.runQuery(internal.messages.verifyProxyToken, {
    chatId: parsed.data.chatId,
    secret: parsed.data.secret
  })
  if (!owner) return jsonErr('invalid secret', 401)
  const [allowedOwner, allowedChat] = await Promise.all([
    ctx.runMutation(internal.lib.checkRateLimit, { max: 60, owner: `complete-owner:${owner}` }),
    ctx.runMutation(internal.lib.checkRateLimit, {
      max: 30,
      owner: `complete-chat:${parsed.data.chatId}`
    })
  ])
  if (!(allowedOwner && allowedChat)) return jsonErr('rate limited', 429)
  try {
    await ctx.runMutation(internal.messages.complete, {
      chatId: parsed.data.chatId as Id<'chats'>,
      secret: parsed.data.secret,
      sessionId: parsed.data.sessionId
    })
    return Response.json({ ok: true })
  } catch (error) {
    return jsonErr(error instanceof Error ? error.message : 'error', 400)
  }
})
const verifyProxyToken = internalQuery({
  args: { chatId: v.string(), secret: v.string() },
  handler: async (ctx, { chatId, secret }): Promise<null | string> => {
    let chat: Awaited<ReturnType<typeof ctx.db.get<'chats'>>>
    try {
      chat = await ctx.db.get(chatId as Id<'chats'>)
    } catch {
      return null
    }
    const provided = await hashSecret(secret)
    const stored = chat?.secretHash ?? '0'.repeat(64)
    const hashOk = constantTimeEqual(stored, provided)
    if (!(chat?.secretHash && chat.streaming && hashOk)) return null
    return chat.owner
  }
})
const PROXY_UPSTREAM_TIMEOUT_MS = 120_000
const SSE_WALL_CLOCK_MS = 10 * 60 * 1000
const SSE_BYTES_CAP = 50 * 1024 * 1024
const ESTIMATE_RESERVED_CENTS = 100
const anthropicProxy = httpAction(async (ctx, req) => {
  if (req.method !== 'POST') return jsonErr('method not allowed', 405)
  const clientVersion = req.headers.get('anthropic-version') ?? '2023-06-01'
  if (!ANTHROPIC_VERSION_RE.test(clientVersion)) return jsonErr('invalid anthropic-version', 400)
  const authz = req.headers.get('Authorization') ?? ''
  const xKey = req.headers.get('x-api-key') ?? ''
  const token = (authz ? authz.replace(BEARER_RE, '') : xKey).trim()
  const parsed = parseProxyToken(token)
  if (!parsed) return jsonErr('invalid proxy token', 401)
  const { chatId, secret } = parsed
  if (!VALID_CHATID_RE.test(chatId)) return jsonErr('invalid proxy token', 401)
  const owner = await ctx.runQuery(internal.messages.verifyProxyToken, { chatId, secret })
  if (!owner) return jsonErr('invalid proxy token', 401)
  const safeRateLimit = async (max: number, key: string): Promise<boolean> => {
    try {
      return await ctx.runMutation(internal.lib.checkRateLimit, { max, owner: key })
    } catch {
      return true
    }
  }
  const [allowed, allowedChat] = await Promise.all([
    safeRateLimit(600, `anthropic-owner:${owner}`),
    safeRateLimit(300, `anthropic-chat:${chatId}`)
  ])
  if (!(allowed && allowedChat)) return jsonErr('rate limited', 429)
  const url = new URL(req.url)
  const upstreamPath = url.pathname.replace(ANTHROPIC_PREFIX_RE, '') || '/v1/messages'
  if (!ALLOWED_UPSTREAM_PATHS.has(upstreamPath)) return jsonErr('path not allowed', 403)
  const isCountTokens = upstreamPath === '/v1/messages/count_tokens'
  const reqCt = (req.headers.get('content-type') ?? '').toLowerCase()
  if (!reqCt.includes('application/json')) return jsonErr('content-type must be application/json', 400)
  const cl = req.headers.get('content-length')
  if (cl) {
    const n = Number(cl)
    if (!Number.isFinite(n) || n < 0) return jsonErr('invalid content-length', 400)
    if (n > MAX_PROXY_BODY) return jsonErr('body too large', 413)
  }
  const abort = new AbortController()
  const timeout = setTimeout(() => abort.abort(), PROXY_UPSTREAM_TIMEOUT_MS)
  let buffered: ArrayBuffer | undefined
  if (req.body)
    try {
      try {
        buffered = await new Response(
          boundedBody(req.body, MAX_PROXY_BODY, {
            idleMs: 15_000,
            onAbort: () => {
              abort.abort()
            },
            onExceed: () => {
              abort.abort()
            }
          })
        ).arrayBuffer()
      } catch (streamError) {
        const m = streamError instanceof Error ? streamError.message : ''
        if (m.includes('ReadableStream')) buffered = await req.arrayBuffer()
        else throw streamError
      }
      if (buffered === undefined) {
        clearTimeout(timeout)
        return jsonErr('bad request body', 400)
      }
      if (buffered.byteLength > MAX_PROXY_BODY) {
        clearTimeout(timeout)
        return jsonErr('body too large', 413)
      }
    } catch (bodyError) {
      clearTimeout(timeout)
      const msg = bodyError instanceof Error ? bodyError.message : 'body error'
      if (msg === 'body too large') return jsonErr('body too large', 413)
      return jsonErr('bad request body', 400)
    }
  let reservedDayKey: null | string = null
  let reservedCents = ESTIMATE_RESERVED_CENTS
  let modelName: string | undefined
  if (!isCountTokens) {
    let maxTokens = 4096
    if (buffered)
      try {
        const bodyObj = JSON.parse(new TextDecoder().decode(buffered)) as {
          max_tokens?: unknown
          model?: unknown
        }
        if (typeof bodyObj.max_tokens === 'number' && bodyObj.max_tokens > 0)
          maxTokens = Math.min(bodyObj.max_tokens, 200_000)
        if (typeof bodyObj.model === 'string') modelName = bodyObj.model
      } catch {
        /* Non-JSON — upstream will reject */
      }
    const rates = (modelName ? MODEL_RATES[modelName] : undefined) ?? DEFAULT_RATES
    const inputTokensWorst = Math.min(buffered ? buffered.byteLength / 3 : 8000, 200_000)
    const inputCents = Math.ceil((rates.inputUSDPerMtok * 1.25 * inputTokensWorst) / 10_000)
    const outputCents = Math.ceil((rates.outputUSDPerMtok * maxTokens) / 10_000)
    reservedCents = Math.max(ESTIMATE_RESERVED_CENTS, inputCents + outputCents)
    const reserve = await ctx.runMutation(internal.ownerSpend.reserveBudget, { cents: reservedCents, owner })
    if (!reserve.ok) {
      clearTimeout(timeout)
      const msg = reserve.reason === 'inflight' ? 'too many concurrent requests' : 'daily owner USD budget exhausted'
      return jsonErr(msg, 402)
    }
    reservedDayKey = reserve.dayKey
  }
  const budgetOk = await ctx.runMutation(internal.chatRuntime.consumeProxyCallBudget, {
    chatId: chatId as Id<'chats'>
  })
  if (!budgetOk) {
    clearTimeout(timeout)
    log('warn', 'proxy.turn-budget.exhausted', { chatId, owner })
    if (reservedDayKey !== null)
      await ctx.runMutation(internal.ownerSpend.settleReservation, {
        actualCents: 0,
        owner,
        reservedCents,
        reservedDayKey
      })
    return jsonErr('proxy turn budget exhausted', 429)
  }
  let settledDoneOuter = false
  let upstream: string
  const upstreamBase = new URL(env.KIMI_BASE_URL)
  try {
    const basePath = upstreamBase.pathname.replace(TRAILING_SLASH_RE, '')
    const relPath = upstreamPath.startsWith('/') ? upstreamPath : `/${upstreamPath}`
    const candidate = new URL(`${basePath}${relPath}`, `${upstreamBase.protocol}//${upstreamBase.host}`)
    if (candidate.host !== upstreamBase.host) return jsonErr('invalid upstream', 400)
    upstream = candidate.toString()
  } catch {
    return jsonErr('invalid upstream', 400)
  }
  const realKey = env.KIMI_API_KEY
  const forwardHeaders = new Headers()
  for (const [k, val] of req.headers.entries()) if (!SKIP_REQ_HEADERS.has(k.toLowerCase())) forwardHeaders.set(k, val)
  forwardHeaders.set('Authorization', `Bearer ${realKey}`)
  forwardHeaders.delete('x-api-key')
  forwardHeaders.set('anthropic-version', clientVersion)
  const refundReservation = async (cause: string): Promise<void> => {
    if (reservedDayKey === null) return
    log('info', 'proxy.refund', { cause, owner, reservedCents, reservedDayKey })
    try {
      await ctx.scheduler.runAfter(0, internal.ownerSpend.settleReservation, {
        actualCents: 0,
        owner,
        reservedCents,
        reservedDayKey
      })
    } catch (refundError) {
      log('error', 'proxy.refund.failed', {
        cause,
        error: refundError instanceof Error ? refundError.message : 'unknown',
        owner
      })
    }
  }
  try {
    const res = await fetch(upstream, {
      body: buffered,
      headers: forwardHeaders,
      method: req.method,
      signal: abort.signal
    })
    if (res.status === 429)
      log('warn', 'proxy.upstream.429', {
        owner,
        path: upstream,
        retryAfter: res.headers.get('retry-after') ?? null
      })
    if (res.status >= 500) {
      const errBodyText = await res.clone().text()
      log('error', 'proxy.upstream.5xx', {
        body: errBodyText.slice(0, 500),
        owner,
        path: upstream,
        reqBytes: buffered?.byteLength ?? 0,
        status: res.status
      })
    }
    const respHeaders = new Headers()
    for (const [k, val] of res.headers.entries()) if (!SKIP_RES_HEADERS.has(k.toLowerCase())) respHeaders.set(k, val)
    const isSse = (res.headers.get('content-type') ?? '').toLowerCase().includes('text/event-stream')
    const cap = isSse ? SSE_BYTES_CAP : MAX_PROXY_BODY * 8
    const postSettle = async (actual: number, cause: string): Promise<void> => {
      if (reservedDayKey === null) return
      log('info', 'proxy.settle', { actual, cause, owner, reservedCents, reservedDayKey })
      try {
        await ctx.scheduler.runAfter(0, internal.ownerSpend.settleReservation, {
          actualCents: actual,
          owner,
          reservedCents,
          reservedDayKey
        })
        await ctx.scheduler.runAfter(0, internal.costRecords.upsert, {
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
          cents: actual,
          inputTokens: 0,
          model: modelName ?? 'kimi-for-coding',
          outputTokens: 0,
          owner
        })
      } catch (settleError) {
        log('error', 'proxy.settle.failed', {
          actual,
          cause,
          error: settleError instanceof Error ? settleError.message : 'unknown',
          owner
        })
      }
    }
    const settled = async (u: UsageReport): Promise<void> => {
      log('info', 'proxy.settled.enter', { hasUsage: u.inputTokens > 0 || u.outputTokens > 0, owner, settledDoneOuter, u })
      if (settledDoneOuter) return
      settledDoneOuter = true
      const actualCents = computeActualCents(u)
      await postSettle(actualCents, 'sse-flush')
      try {
        await ctx.scheduler.runAfter(0, internal.costRecords.upsert, {
          cacheCreationInputTokens: u.cacheCreationInputTokens,
          cacheReadInputTokens: u.cacheReadInputTokens,
          cents: actualCents,
          inputTokens: u.inputTokens,
          model: modelName ?? 'unknown',
          outputTokens: u.outputTokens,
          owner
        })
      } catch (error) {
        log('error', 'costRecords.upsert.failed', { error: error instanceof Error ? error.message : 'unknown', owner })
      }
    }
    let getSseUsage: (() => UsageReport) | null = null
    let hasSseUsage: (() => boolean) | null = null
    const settleOrRefund = async (cause: string): Promise<void> => {
      if (settledDoneOuter) return
      settledDoneOuter = true
      if (hasSseUsage?.() && getSseUsage) {
        const u = getSseUsage()
        const actualCents = computeActualCents(u)
        await postSettle(actualCents, cause)
        try {
          await ctx.scheduler.runAfter(0, internal.costRecords.upsert, {
            cacheCreationInputTokens: u.cacheCreationInputTokens,
            cacheReadInputTokens: u.cacheReadInputTokens,
            cents: actualCents,
            inputTokens: u.inputTokens,
            model: modelName ?? 'unknown',
            outputTokens: u.outputTokens,
            owner
          })
        } catch (error) {
          log('error', 'costRecords.upsert.failed', {
            cause,
            error: error instanceof Error ? error.message : 'unknown',
            owner
          })
        }
      } else await refundReservation(cause)
    }
    const settleOrRefundFireForget = (cause: string): void => {
      settleOrRefund(cause)
    }
    let wallTimer: null | ReturnType<typeof setTimeout> = null
    if (isSse) {
      clearTimeout(timeout)
      wallTimer = globalThis.setTimeout(() => {
        settleOrRefundFireForget('sse-wall-clock')
        abort.abort()
      }, SSE_WALL_CLOCK_MS)
    }
    let tappedBody: null | ReadableStream<Uint8Array> = res.body
    if (isSse && res.body) {
      const tap = sseCostTap(res.body, settled)
      tappedBody = tap.body
      getSseUsage = tap.getUsage
      hasSseUsage = tap.hasUsage
    }
    const bodyOut = boundedBody(
      tappedBody,
      cap,
      isSse
        ? {
            idleMs: 30_000,
            onAbort: () => settleOrRefundFireForget('sse-idle-or-error'),
            onClose: () => {
              if (wallTimer) clearTimeout(wallTimer)
            },
            sse: true
          }
        : undefined
    )
    const cancelAware =
      isSse && bodyOut ? withCancelHook(bodyOut, () => settleOrRefundFireForget('sse-client-cancel')) : bodyOut
    if (isSse) {
      respHeaders.set('x-sse-idle-ms', '30000')
      respHeaders.set('x-sse-wall-ms', String(SSE_WALL_CLOCK_MS))
    } else {
      const text = await new Response(bodyOut).text()
      try {
        const obj = JSON.parse(text) as {
          model?: string
          usage?: {
            cache_creation_input_tokens?: number
            cache_read_input_tokens?: number
            input_tokens?: number
            output_tokens?: number
          }
        }
        if (obj.usage && !settledDoneOuter) {
          settledDoneOuter = true
          await postSettle(
            computeActualCents({
              cacheCreationInputTokens: obj.usage.cache_creation_input_tokens ?? 0,
              cacheReadInputTokens: obj.usage.cache_read_input_tokens ?? 0,
              inputTokens: obj.usage.input_tokens ?? 0,
              model: obj.model,
              outputTokens: obj.usage.output_tokens ?? 0
            }),
            'non-sse-usage'
          )
        }
      } catch {
        /* Non-JSON response */
      }
      if (!settledDoneOuter) {
        settledDoneOuter = true
        await (res.ok ? postSettle(reservedCents, 'non-sse-no-usage') : refundReservation('non-sse-error'))
      }
      return new Response(text, { headers: respHeaders, status: res.status })
    }
    return new Response(cancelAware, { headers: respHeaders, status: res.status })
  } catch (error) {
    if (!settledDoneOuter) {
      settledDoneOuter = true
      await refundReservation('proxy-throw')
    }
    const rawMsg = error instanceof Error ? error.message : 'upstream error'
    const msg = stripSecretsForProxyLog(rawMsg)
    // eslint-disable-next-line no-console
    console.error(JSON.stringify({ error: msg, event: 'proxy.upstream_fail', level: 'error' }))
    if (msg === 'body too large') return jsonErr('body too large', 413)
    if (abort.signal.aborted) return jsonErr('upstream timeout', 504)
    return jsonErr('upstream error', 502)
  } finally {
    clearTimeout(timeout)
  }
})
export {
  anthropicProxy,
  complete,
  completeHttp,
  insertAgentEvent,
  insertError,
  insertStreamEvent,
  lastUserMessage,
  list,
  send,
  sendInternal,
  streamEventHttp,
  streamEvents,
  streamEventsForLiveness,
  timeoutStreaming,
  verifyProxyToken
}
