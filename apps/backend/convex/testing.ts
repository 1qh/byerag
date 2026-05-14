/** biome-ignore-all lint/performance/noAwaitInLoops: sequential Convex DB deletes */
/** biome-ignore-all lint/suspicious/useAwait: vitest async */
/** biome-ignore-all lint/style/noProcessEnv: TEST_SECRET standalone test env */
/** biome-ignore-all lint/complexity/useLiteralKeys: env bracket */
/* eslint-disable no-await-in-loop, @typescript-eslint/dot-notation */
/* oxlint-disable eslint(no-await-in-loop), eslint(dot-notation) */
import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import type { Id } from './_generated/dataModel'
import { internal } from './_generated/api'
import { action, internalMutation, internalQuery, mutation, query } from './_generated/server'
import { constantTimeEqual } from './utils'
const verifyTestSecret = (secret: string) => {
  // biome-ignore lint/nursery/noUndeclaredEnvVars: NODE_ENV=test (in-process bun:test) OR ALLOW_TESTING_ENDPOINTS=1 (real backend opt-in)
  const allowed = process.env['NODE_ENV'] === 'test' || process.env['ALLOW_TESTING_ENDPOINTS'] === '1'
  if (!allowed) throw new Error('testing endpoints disabled (set ALLOW_TESTING_ENDPOINTS=1 on backend to enable)')
  const expected: string | undefined = process.env['TEST_SECRET']
  if (!expected) throw new Error('testing endpoints disabled (TEST_SECRET unset)')
  if (!constantTimeEqual(secret, expected)) throw new Error('invalid test secret')
}
const send = mutation({
  args: {
    app: v.string(),
    chatId: v.optional(v.id('chats')),
    content: v.string(),
    email: v.string(),
    testSecret: v.string()
  },
  handler: async (ctx, { app, testSecret, email, chatId, content }): Promise<Id<'chats'>> => {
    verifyTestSecret(testSecret)
    const r: { chatId: Id<'chats'>; secret: string } = await ctx.runMutation(internal.messages.sendInternal, {
      app,
      chatId: chatId ?? undefined,
      content,
      email
    })
    return r.chatId
  }
})
const listMessages = query({
  args: {
    chatId: v.id('chats'),
    paginationOpts: paginationOptsValidator,
    testSecret: v.string()
  },
  handler: async (ctx, { testSecret, chatId, paginationOpts }) => {
    verifyTestSecret(testSecret)
    return ctx.db
      .query('messages')
      .withIndex('by_chat', q => q.eq('chatId', chatId))
      .order('asc')
      .paginate(paginationOpts)
  }
})
const listChats = query({
  args: { email: v.string(), testSecret: v.string() },
  handler: async (ctx, { testSecret, email }) => {
    verifyTestSecret(testSecret)
    const chats = await ctx.db
      .query('chats')
      .withIndex('by_owner', q => q.eq('owner', email))
      .collect()
    return chats
      .toSorted((a, b) => b.updatedAt - a.updatedAt)
      .map(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- strip sensitive fields
        ({ secretHash: _h, sessionId: _sessionId, timeoutFunctionId: _timeoutFunctionId, ...rest }) => rest
      )
  }
})
const removeChat = mutation({
  args: { chatId: v.id('chats'), email: v.string(), testSecret: v.string() },
  handler: async (ctx, { testSecret, email, chatId }) => {
    verifyTestSecret(testSecret)
    const chat = await ctx.db.get(chatId)
    if (chat?.owner !== email) return
    const msgs = await ctx.db
      .query('messages')
      .withIndex('by_chat', q => q.eq('chatId', chatId))
      .collect()
    for (const m of msgs) await ctx.db.delete(m._id)
    const events = await ctx.db
      .query('streamEvents')
      .withIndex('by_chat', q => q.eq('chatId', chatId))
      .collect()
    for (const e of events) await ctx.db.delete(e._id)
    await ctx.db.delete(chatId)
  }
})
const listFiles = action({
  args: { email: v.string(), path: v.string(), testSecret: v.string() },
  handler: async (ctx, { testSecret, email, path }): Promise<{ name: string; size?: number; type: string }[]> => {
    verifyTestSecret(testSecret)
    return ctx.runAction(internal.files.list, { email, path })
  }
})
const readFile = action({
  args: { email: v.string(), path: v.string(), testSecret: v.string() },
  handler: async (
    ctx,
    { testSecret, email, path }
  ): Promise<{ binary: boolean; content: string; size: number; truncated: boolean }> => {
    verifyTestSecret(testSecret)
    return ctx.runAction(internal.files.read, { email, path })
  }
})
const docsGenerateUploadUrl = mutation({
  args: { testSecret: v.string() },
  handler: async (ctx, { testSecret }): Promise<string> => {
    verifyTestSecret(testSecret)
    return ctx.storage.generateUploadUrl()
  }
})
const ensureChatRuntime = mutation({
  args: { chatId: v.id('chats'), testSecret: v.string() },
  handler: async (ctx, { chatId, testSecret }): Promise<void> => {
    verifyTestSecret(testSecret)
    const query = ctx.db.query('chatRuntime').withIndex('by_chat', q => q.eq('chatId', chatId))
    const existing: null | { _id: Id<'chatRuntime'> } = query.first()
    if (existing?._id) await ctx.db.patch(existing._id, { proxyCallsThisTurn: 0, streamEventCount: 0 })
    else await ctx.db.insert('chatRuntime', { chatId, proxyCallsThisTurn: 0, streamEventCount: 0 })
  }
})
const consumeProxyBudgetProbe = action({
  args: { chatId: v.id('chats'), testSecret: v.string() },
  handler: async (ctx, { chatId, testSecret }): Promise<boolean> => {
    verifyTestSecret(testSecret)
    return ctx.runMutation(internal.chatRuntime.consumeProxyCallBudget, { chatId })
  }
})
const requestReviewProbe = mutation({
  args: { docId: v.id('docs'), testSecret: v.string(), uploaderEmail: v.string() },
  handler: async (ctx, { docId, testSecret, uploaderEmail }): Promise<{ ok: boolean; reason?: string }> => {
    verifyTestSecret(testSecret)
    const doc = await ctx.db.get(docId)
    if (!doc) return { ok: false, reason: 'not-found' }
    if (doc.uploadedBy !== uploaderEmail) return { ok: false, reason: 'not-uploader' }
    if (doc.policyStatus !== 'rejected') return { ok: false, reason: 'not-rejected' }
    const last = doc.policyReviewRequestedAt ?? 0
    if (Date.now() - last < 86_400_000) return { ok: false, reason: 'rate-limited' }
    await ctx.db.patch(docId, { policyReviewRequestedAt: Date.now() })
    await ctx.db.insert('auditLogs', {
      args: JSON.stringify({ docId, filename: doc.filename }),
      command: 'docs.requestReview',
      mode: 'session',
      ok: true,
      owner: uploaderEmail,
      severity: 'low'
    })
    return { ok: true }
  }
})
const scanOverrideProbe = mutation({
  args: { adminEmail: v.string(), docId: v.id('docs'), testSecret: v.string() },
  handler: async (ctx, { adminEmail, docId, testSecret }): Promise<void> => {
    verifyTestSecret(testSecret)
    const doc = await ctx.db.get(docId)
    if (!doc) throw new Error('doc not found')
    if (doc.scanStatus !== 'quarantined') throw new Error('not quarantined')
    if (!doc.storageId) throw new Error('staging blob already purged')
    await ctx.db.patch(docId, { scanOverriddenAt: Date.now(), scanOverriddenBy: adminEmail, scanStatus: 'clean' })
    await ctx.db.insert('auditLogs', {
      args: JSON.stringify({ docId, filename: doc.filename, signature: doc.scanOverrideSignature }),
      command: 'docs.scanOverride',
      mode: 'session',
      ok: true,
      owner: adminEmail,
      severity: 'high'
    })
  }
})
const checkRateLimitProbe = action({
  args: { max: v.number(), owner: v.string(), testSecret: v.string() },
  handler: async (ctx, { max, owner, testSecret }): Promise<boolean> => {
    verifyTestSecret(testSecret)
    return ctx.runMutation(internal.lib.checkRateLimit, { max, owner })
  }
})
const reserveBudgetProbe = action({
  args: { cents: v.number(), owner: v.string(), testSecret: v.string() },
  handler: async (
    ctx,
    { cents, owner, testSecret }
  ): Promise<{ centsToday: number; dayKey: string; ok: boolean; reason?: string }> => {
    verifyTestSecret(testSecret)
    return ctx.runMutation(internal.ownerSpend.reserveBudget, { cents, owner })
  }
})
const listDocsByOwner = query({
  args: { owner: v.string(), testSecret: v.string() },
  handler: async (
    ctx,
    { owner, testSecret }
  ): Promise<{ _id: Id<'docs'>; filename: string; owner: null | string; scope: 'mine' | 'shared' }[]> => {
    verifyTestSecret(testSecret)
    const rows = await ctx.db
      .query('docs')
      .withIndex('by_scope_uploadedAt', q => q.eq('scope', 'mine'))
      .filter(q => q.and(q.eq(q.field('owner'), owner), q.eq(q.field('deletedAt'), undefined)))
      .collect()
    return rows.map(r => ({ _id: r._id, filename: r.filename, owner: r.owner ?? null, scope: r.scope }))
  }
})
const wipeDocs = mutation({
  args: { testSecret: v.string() },
  handler: async (ctx, { testSecret }): Promise<number> => {
    verifyTestSecret(testSecret)
    const rows = await ctx.db.query('docs').collect()
    for (const r of rows) {
      if (r.storageId) await ctx.storage.delete(r.storageId)
      await ctx.db.delete(r._id)
    }
    return rows.length
  }
})
const getDocRow = query({
  args: { docId: v.id('docs'), testSecret: v.string() },
  handler: async (ctx, { docId, testSecret }) => {
    verifyTestSecret(testSecret)
    return ctx.db.get(docId)
  }
})
const countOwnerSpend = query({
  args: { testSecret: v.string() },
  handler: async (ctx, { testSecret }): Promise<{ count: number; totalCents: number }> => {
    verifyTestSecret(testSecret)
    const rows = await ctx.db.query('ownerSpend').take(200)
    let total = 0
    for (const r of rows) total += r.centsToday
    return { count: rows.length, totalCents: total }
  }
})
const countTestSuggestions = query({
  args: { testSecret: v.string() },
  handler: async (ctx, { testSecret }): Promise<{ count: number; topicNames: string[] }> => {
    verifyTestSecret(testSecret)
    const rows = await ctx.db.query('testQuestionSuggestions').take(200)
    const topicIds = new Set<string>()
    for (const r of rows) topicIds.add(r.topicId)
    const names: string[] = []
    for (const tid of topicIds) {
      const t = await ctx.db.get(tid as never)
      if (t && 'name' in t) names.push((t as { name: string }).name)
    }
    return { count: rows.length, topicNames: names.slice(0, 10) }
  }
})
const countCostRecords = query({
  args: { testSecret: v.string() },
  handler: async (ctx, { testSecret }): Promise<{ count: number; sampleOwners: string[] }> => {
    verifyTestSecret(testSecret)
    const rows = await ctx.db.query('costRecords').take(200)
    const owners = new Set<string>()
    for (const r of rows) owners.add(r.owner)
    return { count: rows.length, sampleOwners: [...owners].slice(0, 5) }
  }
})
const countAuditLogs = query({
  args: { testSecret: v.string() },
  handler: async (ctx, { testSecret }): Promise<{ count: number; sampleCommands: string[] }> => {
    verifyTestSecret(testSecret)
    const rows = await ctx.db.query('auditLogs').take(200)
    const cmds = new Set<string>()
    for (const r of rows) cmds.add(r.command)
    return { count: rows.length, sampleCommands: [...cmds].slice(0, 10) }
  }
})
const docsFinalize = action({
  args: {
    filename: v.string(),
    keepBoth: v.optional(v.boolean()),
    mime: v.string(),
    replace: v.optional(v.boolean()),
    scope: v.union(v.literal('shared'), v.literal('mine')),
    storageId: v.id('_storage'),
    testSecret: v.string(),
    uploaderEmail: v.string()
  },
  handler: async (ctx, { testSecret, ...args }): Promise<unknown> => {
    verifyTestSecret(testSecret)
    return ctx.runAction(internal.docsUpload.finalize, args)
  }
})
const uploadFile = action({
  args: {
    binary: v.optional(v.boolean()),
    content: v.string(),
    email: v.string(),
    path: v.string(),
    testSecret: v.string()
  },
  handler: async (ctx, { testSecret, email, path, content, binary }): Promise<void> => {
    verifyTestSecret(testSecret)
    await ctx.runAction(internal.files.write, { binary, content, email, path })
  }
})
const downloadZip = action({
  args: { email: v.string(), path: v.string(), testSecret: v.string() },
  handler: async (ctx, { testSecret, email, path }): Promise<{ base64: string; size: number }> => {
    verifyTestSecret(testSecret)
    return ctx.runAction(internal.files.downloadZip, { email, path })
  }
})
const listStreamEvents = query({
  args: {
    chatId: v.id('chats'),
    testSecret: v.string()
  },
  handler: async (ctx, { testSecret, chatId }) => {
    verifyTestSecret(testSecret)
    return ctx.db
      .query('streamEvents')
      .withIndex('by_chat', q => q.eq('chatId', chatId))
      .collect()
  }
})
const clearStreamingFlagsInternal = internalMutation({
  args: { testSecret: v.string() },
  handler: async (ctx, { testSecret }): Promise<number> => {
    verifyTestSecret(testSecret)
    const rows = await ctx.db
      .query('chats')
      .filter(q => q.eq(q.field('streaming'), true))
      .collect()
    for (const c of rows) await ctx.db.patch(c._id, { streaming: false })
    return rows.length
  }
})
const getChatStreaming = query({
  args: { chatId: v.id('chats'), testSecret: v.string() },
  handler: async (ctx, { testSecret, chatId }): Promise<boolean> => {
    verifyTestSecret(testSecret)
    const chat = await ctx.db.get(chatId)
    return chat?.streaming ?? false
  }
})
const wipeAllForOwner = mutation({
  args: { email: v.string(), testSecret: v.string() },
  handler: async (ctx, { email, testSecret }): Promise<number> => {
    verifyTestSecret(testSecret)
    const chats = await ctx.db
      .query('chats')
      .withIndex('by_owner', q => q.eq('owner', email))
      .collect()
    for (const chat of chats) {
      const msgs = await ctx.db
        .query('messages')
        .withIndex('by_chat', q => q.eq('chatId', chat._id))
        .collect()
      for (const m of msgs) await ctx.db.delete(m._id)
      const events = await ctx.db
        .query('streamEvents')
        .withIndex('by_chat', q => q.eq('chatId', chat._id))
        .collect()
      for (const e of events) await ctx.db.delete(e._id)
      await ctx.db.delete(chat._id)
    }
    const spendRows = await ctx.db
      .query('ownerSpend')
      .withIndex('by_owner', q => q.eq('owner', email))
      .collect()
    for (const r of spendRows) await ctx.db.delete(r._id)
    return chats.length
  }
})
const listSandboxIds = internalQuery({
  args: { testSecret: v.string() },
  handler: async (ctx, { testSecret }) => {
    verifyTestSecret(testSecret)
    const rows = await ctx.db.query('sandboxes').collect()
    return rows.map(r => ({ owner: r.owner, sandboxId: r.sandboxId }))
  }
})
export {
  checkRateLimitProbe,
  clearStreamingFlagsInternal,
  consumeProxyBudgetProbe,
  countAuditLogs,
  countCostRecords,
  countOwnerSpend,
  countTestSuggestions,
  docsFinalize,
  docsGenerateUploadUrl,
  downloadZip,
  ensureChatRuntime,
  getChatStreaming,
  getDocRow,
  listChats,
  listDocsByOwner,
  listFiles,
  listMessages,
  listSandboxIds,
  listStreamEvents,
  readFile,
  removeChat,
  requestReviewProbe,
  reserveBudgetProbe,
  scanOverrideProbe,
  send,
  uploadFile,
  wipeAllForOwner,
  wipeDocs
}
