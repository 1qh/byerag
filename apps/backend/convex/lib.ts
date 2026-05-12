/** biome-ignore-all lint/performance/noAwaitInLoops: sequential Convex DB deletes */
/** biome-ignore-all lint/suspicious/noControlCharactersInRegex: intentional security sanitization */
/* eslint-disable no-await-in-loop, no-control-regex */
/* oxlint-disable eslint(no-await-in-loop), eslint(no-control-regex) */
import { v } from 'convex/values'
import { internal } from './_generated/api'
import { internalMutation, internalQuery } from './_generated/server'
const RE_CONTROL_ASCII = /[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F]/gu
const RE_NEWLINES = /[\n\r\u0085\u2028\u2029]/gu
const RE_HTML_TAGS = /<[^>]*>/gu
const RE_UNICODE_CONTROL = /[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/gu
const RE_MD_LINK = /\[(?<text>[^\]]*)\]\([^)]*\)/gu
const RE_MD_IMAGE = /!\[(?<alt>[^\]]*)\]\([^)]*\)/gu
const RE_CODE_BLOCK = /```[\s\S]*?```/gu
const RE_INLINE_CODE = /`[^`]*`/gu
const RE_HEADING = /#{1,6}\s/gu
const RE_SHELL_SUBST = /\$[({A-Z_]/gu
const RE_PIPE_SEMI = /[|;]/gu
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 30
const AUDIT_LOG_TTL_MS = 30 * 24 * 60 * 60 * 1000
const sanitizeForDisplay = (text: unknown, max = 4000): string => {
  if (typeof text !== 'string') return ''
  return text
    .replaceAll(RE_CONTROL_ASCII, '')
    .replaceAll(RE_UNICODE_CONTROL, '')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .slice(0, max)
}
const sanitizeExternal = (text: unknown): string => {
  if (typeof text !== 'string') return ''
  return text
    .replaceAll(RE_CONTROL_ASCII, '')
    .replaceAll(RE_NEWLINES, ' ')
    .replaceAll(RE_HTML_TAGS, '')
    .replaceAll(RE_UNICODE_CONTROL, '')
    .replaceAll(RE_MD_LINK, '$<text>')
    .replaceAll(RE_MD_IMAGE, '')
    .replaceAll(RE_CODE_BLOCK, '')
    .replaceAll(RE_INLINE_CODE, '')
    .replaceAll(RE_HEADING, '')
    .replaceAll(RE_SHELL_SUBST, '_')
    .replaceAll('`', "'")
    .replaceAll(RE_PIPE_SEMI, ',')
    .slice(0, 500)
}
const STATS_CHAT_LIMIT = 1000
const getStats = internalQuery({
  args: { owner: v.string() },
  handler: async (ctx, { owner }) => {
    const chats = await ctx.db
      .query('chats')
      .withIndex('by_owner', q => q.eq('owner', owner))
      .take(STATS_CHAT_LIMIT)
    let totalMessages = 0
    for (const chat of chats) totalMessages += chat.messageCount
    return {
      activeStreaming: chats.filter(c => c.streaming).length,
      totalChats: chats.length,
      totalMessages,
      truncated: chats.length === STATS_CHAT_LIMIT
    }
  }
})
const pruneStaleRateLimits = internalMutation({
  args: {},
  handler: async ctx => {
    const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS
    const rows = await ctx.db
      .query('rateLimits')
      .withIndex('by_updatedAt', q => q.lte('updatedAt', cutoff))
      .take(2000)
    for (const row of rows) await ctx.db.delete(row._id)
    const legacy = await ctx.db
      .query('rateLimits')
      .filter(q => q.eq(q.field('updatedAt'), undefined))
      .take(500)
    for (const row of legacy) await ctx.db.delete(row._id)
    if (rows.length >= 2000 || legacy.length >= 500)
      await ctx.scheduler.runAfter(1000, internal.lib.pruneStaleRateLimits, {})
  }
})
const insertAuditLog = internalMutation({
  args: { args: v.string(), command: v.string(), mode: v.string(), ok: v.boolean(), owner: v.string() },
  handler: async (ctx, row) => {
    await ctx.db.insert('auditLogs', row)
  }
})
const pruneAuditLogs = internalMutation({
  args: {},
  handler: async ctx => {
    const cutoff = Date.now() - AUDIT_LOG_TTL_MS
    const old = await ctx.db.query('auditLogs').order('asc').take(5000)
    let deleted = 0
    for (const row of old) {
      if (row._creationTime >= cutoff) break
      await ctx.db.delete(row._id)
      deleted += 1
    }
    if (deleted >= 5000) await ctx.scheduler.runAfter(1000, internal.lib.pruneAuditLogs, {})
  }
})
const checkRateLimit = internalMutation({
  args: { max: v.optional(v.number()), owner: v.string() },
  handler: async (ctx, { owner, max }): Promise<boolean> => {
    const limit = max ?? RATE_LIMIT_MAX
    const now = Date.now()
    // biome-ignore lint/nursery/noPlaywrightUselessAwait: Convex .first() returns thenable
    const existing = await ctx.db
      .query('rateLimits')
      .withIndex('by_owner', q => q.eq('owner', owner))
      .first()
    const patch = { refilledAt: now, timestamps: undefined, tokens: limit - 1, updatedAt: now }
    if (existing?.tokens === undefined || existing.refilledAt === undefined) {
      await (existing
        ? ctx.db.patch(existing._id, patch)
        : ctx.db.insert('rateLimits', { owner, refilledAt: now, tokens: limit - 1, updatedAt: now }))
      return true
    }
    const elapsedMs = Math.max(0, now - existing.refilledAt)
    const refillRatePerMs = limit / RATE_LIMIT_WINDOW_MS
    const refilled = Math.min(limit, existing.tokens + elapsedMs * refillRatePerMs)
    if (refilled < 1) {
      await ctx.db.patch(existing._id, { refilledAt: now, tokens: refilled, updatedAt: now })
      return false
    }
    await ctx.db.patch(existing._id, { refilledAt: now, tokens: refilled - 1, updatedAt: now })
    return true
  }
})
export {
  checkRateLimit,
  getStats,
  insertAuditLog,
  pruneAuditLogs,
  pruneStaleRateLimits,
  sanitizeExternal,
  sanitizeForDisplay
}
