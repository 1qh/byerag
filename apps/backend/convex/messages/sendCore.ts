/* eslint-disable @typescript-eslint/max-params, @typescript-eslint/no-shadow, @typescript-eslint/no-deprecated, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/use-unknown-in-catch-callback-variable, no-await-in-loop, no-continue, no-shadow, no-useless-assignment, unicorn/prefer-ternary, unicorn/no-new-array, unicorn/prefer-array-find */
/** biome-ignore-all lint/nursery/noContinue: control flow shape */
/** biome-ignore-all lint/nursery/noShadow: scoped shadows ok */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential by design */
/** biome-ignore-all lint/performance/useTopLevelRegex: scoped regex ok */
/** biome-ignore-all lint/style/useExplicitLengthCheck: idiomatic */
/** biome-ignore-all lint/correctness/noUnusedVariables: pending feature */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential Convex DB ops */
/* eslint-disable no-await-in-loop */
/* oxlint-disable eslint(complexity), eslint(no-await-in-loop) */
import { z } from 'zod/v4'
import type { Id } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'
import { internal } from '../_generated/api'
import { isAppId } from '../apps/manifest'
import { createRuntime, resetTurn } from '../chatRuntime'
import { MAX_CONCURRENT_AGENTS, MAX_CONTENT_LENGTH, STREAMING_TIMEOUT_MS } from '../constants'
import { sanitizeExternal } from '../lib'
import { generateSecret, hashSecret } from '../secretHash'
import { constantTimeEqual } from '../utils'
const VALID_SESSION_ID = /^[a-f0-9-]{36}$/u
const WHITESPACE_RE = /\s+/gu
const SENTENCE_SPLIT_RE = /[.!?]\s+/u
const QUESTION_WORD_RE = /\b(?<q>what|how|why|when|which|who|where|should|can|does|do|is|are)\b/iu
const sessionMessage = z.object({
  message: z.record(z.string(), z.unknown()).optional(),
  parent_tool_use_id: z.string().nullable().optional(),
  session_id: z.string().optional(),
  subtype: z.string().optional(),
  type: z.enum(['user', 'assistant', 'system', 'result']),
  uuid: z.string().optional()
})
const verifySecret = async (ctx: MutationCtx, chatId: Id<'chats'>, secret: string) => {
  const chat = await ctx.db.get(chatId)
  if (!chat?.secretHash) throw new Error('unauthorized')
  const provided = await hashSecret(secret)
  if (!constantTimeEqual(chat.secretHash, provided)) throw new Error('unauthorized')
}
const sanitizeTitle = (s: string): string => {
  const cleaned = sanitizeExternal(s).replaceAll(WHITESPACE_RE, ' ').trim()
  if (!cleaned) return 'Untitled'
  const sentences = cleaned.split(SENTENCE_SPLIT_RE).filter(Boolean)
  const question = sentences.find(p => QUESTION_WORD_RE.test(p))
  const candidate = question ?? sentences[0] ?? cleaned
  if (candidate.length <= 80) return candidate
  const cut = candidate.slice(0, 79)
  const lastSpace = cut.lastIndexOf(' ')
  const base = lastSpace > 40 ? cut.slice(0, lastSpace).trim() : cut
  return `${base}…`
}
const sendCore = async (
  ctx: MutationCtx,
  { app, email, chatId, content }: { app: string; chatId?: Id<'chats'>; content: string; email: string }
): Promise<{ chatId: Id<'chats'>; secret: string }> => {
  if (!content.trim()) throw new Error('empty message')
  if (!isAppId(app)) throw new Error(`unknown app id: ${app}`)
  if (content.length > MAX_CONTENT_LENGTH) throw new Error('message too long')
  if (chatId) {
    const chat = await ctx.db.get(chatId)
    if (!chat) throw new Error('chat not found')
    if (chat.owner !== email) throw new Error('unauthorized')
    if (chat.streaming) throw new Error('chat is busy')
  }
  const streamingCutoff = Date.now() - STREAMING_TIMEOUT_MS
  const ownerStreaming = await ctx.db
    .query('chats')
    .withIndex('by_owner_streaming', q => q.eq('owner', email).eq('streaming', true))
    .take(50)
  const streamingCount = ownerStreaming.filter(c => c.streamingStartedAt >= streamingCutoff && c._id !== chatId).length
  if (streamingCount >= MAX_CONCURRENT_AGENTS)
    throw new Error(`Too many concurrent sessions (${streamingCount}/${MAX_CONCURRENT_AGENTS}).`)
  const now = Date.now()
  const isNew = !chatId
  let secret = generateSecret()
  let secretHash = await hashSecret(secret)
  const cid: Id<'chats'> =
    chatId ??
    (await ctx.db.insert('chats', {
      app,
      messageCount: 1,
      owner: email,
      secretHash,
      streaming: true,
      streamingStartedAt: now,
      title: sanitizeTitle(content),
      turns: 1,
      updatedAt: now
    }))
  let seq: number
  if (isNew) {
    seq = 0
    await createRuntime(ctx, cid)
  } else {
    const chat = await ctx.db.get(cid)
    if (!chat) throw new Error('chat not found')
    if (chat.owner !== email) throw new Error('unauthorized')
    secret = generateSecret()
    secretHash = await hashSecret(secret)
    seq = chat.messageCount
    if (chat.timeoutFunctionId)
      try {
        await ctx.scheduler.cancel(chat.timeoutFunctionId)
      } catch {
        /* Scheduled function may have already fired — safe to ignore */
      }
    await ctx.db.patch(cid, {
      messageCount: seq + 1,
      secretHash,
      streaming: true,
      streamingStartedAt: now,
      turns: chat.turns + 1,
      updatedAt: now
    })
  }
  if (!isNew) {
    await resetTurn(ctx, cid)
    for (;;) {
      const batch = await ctx.db
        .query('streamEvents')
        .withIndex('by_chat', q => q.eq('chatId', cid))
        .take(500)
      if (batch.length === 0) break
      await Promise.all(batch.map(async e => ctx.db.delete(e._id)))
      if (batch.length < 500) break
    }
  }
  await ctx.db.insert('messages', {
    chatId: cid,
    content: JSON.stringify({
      message: { content: [{ text: content, type: 'text' }], role: 'user' },
      parent_tool_use_id: null,
      session_id: '',
      type: 'user',
      uuid: crypto.randomUUID()
    }),
    seq,
    type: 'user'
  })
  const timeoutFunctionId = await ctx.scheduler.runAfter(STREAMING_TIMEOUT_MS, internal.messages.timeoutStreaming, {
    chatId: cid
  })
  await ctx.db.patch(cid, { timeoutFunctionId })
  await ctx.scheduler.runAfter(0, internal.agent.run, { chatId: cid, email, secret })
  const d = new Date()
  const dayKey = `${d.getUTCFullYear()}-${(d.getUTCMonth() + 1).toString().padStart(2, '0')}-${d.getUTCDate().toString().padStart(2, '0')}`
  // biome-ignore lint/nursery/noPlaywrightUselessAwait: Convex .first() returns thenable
  const existing = await ctx.db
    .query('costRecords')
    .withIndex('by_owner_model_dayKey', q => q.eq('owner', email).eq('model', 'kimi-for-coding').eq('dayKey', dayKey))
    .first()
  if (existing) await ctx.db.patch(existing._id, { callCount: existing.callCount + 1 })
  else
    await ctx.db.insert('costRecords', {
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      callCount: 1,
      cents: 0,
      dayKey,
      inputTokens: 0,
      model: 'kimi-for-coding',
      outputTokens: 0,
      owner: email
    })
  return { chatId: cid, secret }
}
export { sanitizeTitle, sendCore, sessionMessage, VALID_SESSION_ID, verifySecret }
