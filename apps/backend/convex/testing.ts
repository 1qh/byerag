/* eslint-disable no-continue, @typescript-eslint/no-unnecessary-condition */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential Convex DB ops */
/** biome-ignore-all lint/nursery/noContinue: control flow shape */
/** biome-ignore-all lint/nursery/noShadow: scoped shadows ok */
/* oxlint-disable eslint(no-await-in-loop), eslint(complexity), eslint(no-shadow), eslint(no-unused-vars), unicorn(no-array-reduce), eslint(max-params) */
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
const sendWithSecret = mutation({
  args: {
    app: v.string(),
    content: v.string(),
    email: v.string(),
    testSecret: v.string()
  },
  handler: async (ctx, { app, testSecret, email, content }): Promise<{ chatId: Id<'chats'>; secret: string }> => {
    verifyTestSecret(testSecret)
    return ctx.runMutation(internal.messages.sendInternal, { app, content, email })
  }
})
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
const resetPolicyPending = mutation({
  args: { docId: v.id('docs'), testSecret: v.string() },
  handler: async (ctx, { docId, testSecret }): Promise<void> => {
    verifyTestSecret(testSecret)
    await ctx.db.patch(docId, { policyCategory: undefined, policyReason: undefined, policyStatus: 'pending' })
  }
})
const setUserDepartmentProbe = mutation({
  args: {
    adminEmail: v.string(),
    department: v.optional(v.union(v.literal('HR'), v.literal('IT'), v.literal('Sales'))),
    testSecret: v.string(),
    userId: v.string()
  },
  handler: async (ctx, { userId, department, adminEmail, testSecret }): Promise<{ ok: boolean }> => {
    verifyTestSecret(testSecret)
    const rows = await ctx.db
      .query('userProfiles')
      .withIndex('by_userId', q => q.eq('userId', userId))
      .collect()
    const row = rows[0]
    if (!row) throw new Error('not found')
    await ctx.db.patch(row._id, { department, updatedAt: Date.now(), updatedBy: adminEmail })
    return { ok: true }
  }
})
const whoAmIProbe = query({
  args: { testSecret: v.string() },
  handler: async (ctx, { testSecret }): Promise<null | Record<string, unknown>> => {
    verifyTestSecret(testSecret)
    const id = await ctx.auth.getUserIdentity()
    return id
  }
})
const listUsersProbe = query({
  args: { testSecret: v.string() },
  handler: async (ctx, { testSecret }): Promise<{ _id: string; email?: string; isAnonymous?: boolean }[]> => {
    verifyTestSecret(testSecret)
    const rows = await ctx.db.query('users').collect()
    return rows.map(r => ({
      _id: r._id,
      email: (r as { email?: string }).email,
      isAnonymous: (r as { isAnonymous?: boolean }).isAnonymous
    }))
  }
})
const getUserProfile = query({
  args: { testSecret: v.string(), userId: v.string() },
  handler: async (ctx, { userId, testSecret }): Promise<null | { department?: string; role: string }> => {
    verifyTestSecret(testSecret)
    const rows = await ctx.db
      .query('userProfiles')
      .withIndex('by_userId', q => q.eq('userId', userId))
      .collect()
    const r = rows[0]
    return r ? { department: r.department ?? undefined, role: r.role } : null
  }
})
const seedUserProfile = mutation({
  args: { role: v.union(v.literal('admin'), v.literal('user')), testSecret: v.string(), userId: v.string() },
  handler: async (ctx, { userId, role, testSecret }): Promise<void> => {
    verifyTestSecret(testSecret)
    const rows = await ctx.db
      .query('userProfiles')
      .withIndex('by_userId', q => q.eq('userId', userId))
      .collect()
    const existing = rows[0]
    await (existing
      ? ctx.db.patch(existing._id, { role, updatedAt: Date.now(), updatedBy: 'test-seed' })
      : ctx.db.insert('userProfiles', { role, updatedAt: Date.now(), updatedBy: 'test-seed', userId }))
  }
})
const setUserRoleProbe = mutation({
  args: {
    adminEmail: v.string(),
    role: v.union(v.literal('admin'), v.literal('user')),
    testSecret: v.string(),
    userId: v.string()
  },
  handler: async (ctx, { userId, role, adminEmail, testSecret }): Promise<{ error?: string; ok: boolean }> => {
    verifyTestSecret(testSecret)
    const rows = await ctx.db
      .query('userProfiles')
      .withIndex('by_userId', q => q.eq('userId', userId))
      .collect()
    const row = rows[0]
    if (!row) return { error: 'not-found', ok: false }
    if (row.role === 'admin' && role === 'user') {
      const adminRows = await ctx.db
        .query('userProfiles')
        .withIndex('by_role', q => q.eq('role', 'admin'))
        .take(50)
      if (adminRows.filter(a => a.userId !== userId).length === 0) return { error: 'cannot demote last admin', ok: false }
    }
    await ctx.db.patch(row._id, { role, updatedAt: Date.now(), updatedBy: adminEmail })
    return { ok: true }
  }
})
const countAdmins = query({
  args: { testSecret: v.string() },
  handler: async (ctx, { testSecret }): Promise<number> => {
    verifyTestSecret(testSecret)
    const rows = await ctx.db
      .query('userProfiles')
      .withIndex('by_role', q => q.eq('role', 'admin'))
      .collect()
    return rows.length
  }
})
const setSetting = mutation({
  args: { adminEmail: v.optional(v.string()), key: v.string(), testSecret: v.string(), value: v.string() },
  handler: async (ctx, { key, value, adminEmail, testSecret }): Promise<void> => {
    verifyTestSecret(testSecret)
    const author = adminEmail ?? 'test'
    const rows = await ctx.db
      .query('settings')
      .withIndex('by_key', q => q.eq('key', key))
      .collect()
    const existing = rows[0]
    await (existing
      ? ctx.db.patch(existing._id, { updatedAt: Date.now(), updatedBy: author, value })
      : ctx.db.insert('settings', { key, updatedAt: Date.now(), updatedBy: author, value }))
    if (adminEmail)
      await ctx.db.insert('auditLogs', {
        args: JSON.stringify({ key, valueLen: value.length }),
        command: 'settings.set',
        mode: 'session',
        ok: true,
        owner: adminEmail,
        severity: key === 'corpus_policy' ? 'medium' : 'low'
      })
  }
})
const getSetting = query({
  args: { key: v.string(), testSecret: v.string() },
  handler: async (ctx, { key, testSecret }): Promise<null | { updatedBy: string; value: string }> => {
    verifyTestSecret(testSecret)
    const rows = await ctx.db
      .query('settings')
      .withIndex('by_key', q => q.eq('key', key))
      .collect()
    const r = rows[0]
    return r ? { updatedBy: r.updatedBy, value: r.value } : null
  }
})
const gradebookWithDeptProbe = query({
  args: { testSecret: v.string() },
  handler: async (ctx, { testSecret }): Promise<{ users: { department?: string; userId: string }[] }> => {
    verifyTestSecret(testSecret)
    const userRows = await ctx.db
      .query('userProfiles')
      .withIndex('by_role', q => q.eq('role', 'user'))
      .take(2000)
    return { users: userRows.map(u => ({ department: u.department, userId: u.userId })) }
  }
})
const gradebookProbe = query({
  args: { testSecret: v.string() },
  handler: async (
    ctx,
    { testSecret }
  ): Promise<{
    cells: { glyph: string; topicId: string; userId: string }[]
    topics: { _id: string; name: string }[]
    users: { userId: string }[]
  }> => {
    verifyTestSecret(testSecret)
    const userRows = await ctx.db
      .query('userProfiles')
      .withIndex('by_role', q => q.eq('role', 'user'))
      .take(2000)
    const users = userRows.map(u => ({ userId: u.userId }))
    const topicRows = await ctx.db
      .query('topics')
      .withIndex('by_deletedAt', q => q.eq('deletedAt', undefined))
      .take(500)
    const topicsWithPool: { _id: string; name: string }[] = []
    for (const t of topicRows) {
      const pool = await ctx.db
        .query('testQuestions')
        .withIndex('by_topic_deletedAt', q => q.eq('topicId', t._id).eq('deletedAt', undefined))
        .take(6)
      if (pool.length >= 5) topicsWithPool.push({ _id: t._id, name: t.name })
    }
    const cells: { glyph: string; topicId: string; userId: string }[] = []
    for (const u of users)
      for (const t of topicsWithPool) {
        const passes = await ctx.db
          .query('testPasses')
          .withIndex('by_user_topic_kind', q =>
            q
              .eq('userId', u.userId)
              .eq('topicId', t._id as never)
              .eq('kind', 'assigned')
          )
          .collect()
        const selfPasses = await ctx.db
          .query('testPasses')
          .withIndex('by_user_topic_kind', q =>
            q
              .eq('userId', u.userId)
              .eq('topicId', t._id as never)
              .eq('kind', 'self')
          )
          .collect()
        if (passes[0] || selfPasses[0]) {
          cells.push({ glyph: '✓', topicId: t._id, userId: u.userId })
          continue
        }
        const assigns = await ctx.db
          .query('testAssignments')
          .withIndex('by_user_topic', q => q.eq('userId', u.userId).eq('topicId', t._id as never))
          .filter(q => q.eq(q.field('deletedAt'), undefined))
          .collect()
        const a = assigns[0]
        if (!a) {
          cells.push({ glyph: '·', topicId: t._id, userId: u.userId })
          continue
        }
        cells.push({ glyph: a.createdBy === 'agent' ? 'ⓐ' : '✗', topicId: t._id, userId: u.userId })
      }
    return { cells, topics: topicsWithPool, users }
  }
})
const attemptDetailProbe = query({
  args: { attemptId: v.id('testAttempts'), callerUserId: v.string(), testSecret: v.string() },
  handler: async (
    ctx,
    { attemptId, callerUserId, testSecret }
  ): Promise<null | {
    _id: string
    kind: string
    questionSnapshots?: unknown[]
    score?: number
    status: string
    topicId: string
    total?: number
  }> => {
    verifyTestSecret(testSecret)
    const row = await ctx.db.get(attemptId)
    if (!row) return null
    if (row.userId !== callerUserId) throw new Error('forbidden')
    if (row.status === 'passed') return row
    return {
      _id: row._id,
      kind: row.kind,
      score: row.score ?? 0,
      status: row.status,
      topicId: row.topicId,
      total: row.questionSnapshots.length
    }
  }
})
const startAttemptProbe = mutation({
  args: { testSecret: v.string(), topicId: v.id('topics'), userId: v.string() },
  handler: async (ctx, { userId, topicId, testSecret }): Promise<{ attemptId: string; kind: string }> => {
    verifyTestSecret(testSecret)
    const questions = await ctx.db
      .query('testQuestions')
      .withIndex('by_topic_deletedAt', q => q.eq('topicId', topicId).eq('deletedAt', undefined))
      .take(50)
    if (questions.length < 5) throw new Error('pool < 5')
    const picked = questions.slice(0, 5)
    const liveRows = await ctx.db
      .query('testAssignments')
      .withIndex('by_user_topic', q => q.eq('userId', userId).eq('topicId', topicId))
      .filter(q => q.eq(q.field('deletedAt'), undefined))
      .collect()
    const kind = liveRows[0] ? 'assigned' : 'self'
    const priorRows = await ctx.db
      .query('testAttempts')
      .withIndex('by_user_topic', q => q.eq('userId', userId).eq('topicId', topicId))
      .collect()
    const prior = priorRows[0]
    if (prior) await ctx.db.patch(prior._id, { cancelledReason: 'new-attempt-started', status: 'cancelled' })
    const snapshots = picked.map(q => ({
      choicesShuffled: q.choices,
      correctIndexShuffled: q.correctIndex,
      promptText: q.prompt,
      questionId: q._id,
      revision: q.revision,
      sourceDocIds: q.sourceDocIds
    }))
    const attemptId = await ctx.db.insert('testAttempts', {
      kind,
      questionSnapshots: snapshots,
      startedAt: Date.now(),
      status: 'in-progress',
      topicId,
      userId
    })
    return { attemptId, kind }
  }
})
const submitAttemptProbe = mutation({
  args: { answers: v.array(v.number()), attemptId: v.id('testAttempts'), testSecret: v.string() },
  handler: async (ctx, { attemptId, answers, testSecret }): Promise<{ passed: boolean; score: number }> => {
    verifyTestSecret(testSecret)
    const attempt = await ctx.db.get(attemptId)
    if (!attempt) throw new Error('attempt not found')
    let score = 0
    const snapshots = attempt.questionSnapshots.map((qs, i) => {
      const ans = answers[i] ?? -1
      if (ans === qs.correctIndexShuffled) score += 1
      return { ...qs, userAnswerIndex: ans }
    })
    const passed = score === attempt.questionSnapshots.length
    const finishedAt = Date.now()
    await ctx.db.patch(attemptId, {
      durationMs: finishedAt - attempt.startedAt,
      finishedAt,
      questionSnapshots: snapshots,
      score,
      status: passed ? 'passed' : 'failed'
    })
    if (passed) {
      const passRows = await ctx.db
        .query('testPasses')
        .withIndex('by_user_topic_kind', q =>
          q.eq('userId', attempt.userId).eq('topicId', attempt.topicId).eq('kind', attempt.kind)
        )
        .collect()
      const priorPass = passRows[0]
      await (priorPass
        ? ctx.db.patch(priorPass._id, { attemptId, passedAt: finishedAt })
        : ctx.db.insert('testPasses', {
            attemptId,
            kind: attempt.kind,
            passedAt: finishedAt,
            topicId: attempt.topicId,
            userId: attempt.userId
          }))
    }
    return { passed, score }
  }
})
const claimContextProbe = mutation({
  args: { testSecret: v.string(), token: v.string(), userId: v.string() },
  handler: async (ctx, { userId, token, testSecret }): Promise<void> => {
    verifyTestSecret(testSecret)
    const rows = await ctx.db
      .query('userContexts')
      .withIndex('by_user', q => q.eq('userId', userId))
      .collect()
    const existing = rows[0]
    const now = Date.now()
    await (existing
      ? ctx.db.patch(existing._id, { activeContextHeartbeatAt: now, activeContextToken: token })
      : ctx.db.insert('userContexts', { activeContextHeartbeatAt: now, activeContextToken: token, userId }))
  }
})
const heartbeatProbe = mutation({
  args: { testSecret: v.string(), token: v.string(), userId: v.string() },
  handler: async (ctx, { userId, token, testSecret }): Promise<boolean> => {
    verifyTestSecret(testSecret)
    const rows = await ctx.db
      .query('userContexts')
      .withIndex('by_user', q => q.eq('userId', userId))
      .collect()
    const existing = rows[0]
    if (existing?.activeContextToken !== token) return false
    await ctx.db.patch(existing._id, { activeContextHeartbeatAt: Date.now() })
    return true
  }
})
const sendCheckTokenProbe = mutation({
  args: { activeContextToken: v.string(), testSecret: v.string(), userId: v.string() },
  handler: async (ctx, { userId, activeContextToken, testSecret }): Promise<'mismatch' | 'ok'> => {
    verifyTestSecret(testSecret)
    const rows = await ctx.db
      .query('userContexts')
      .withIndex('by_user', q => q.eq('userId', userId))
      .collect()
    const ctxRow = rows[0] ?? null
    return ctxRow?.activeContextToken === activeContextToken ? 'ok' : 'mismatch'
  }
})
const seedAssignment = mutation({
  args: { createdBy: v.string(), testSecret: v.string(), topicId: v.id('topics'), userId: v.string() },
  handler: async (ctx, { userId, topicId, createdBy, testSecret }): Promise<void> => {
    verifyTestSecret(testSecret)
    await ctx.db.insert('testAssignments', { createdAt: Date.now(), createdBy, topicId, userId })
  }
})
const costCyclePivotProbe = query({
  args: { testSecret: v.string() },
  handler: async (
    ctx,
    { testSecret }
  ): Promise<{ cents: number; inputTokens: number; model: string; outputTokens: number; owner: string }[]> => {
    verifyTestSecret(testSecret)
    const rows = await ctx.db.query('costRecords').take(10_000)
    const agg = new Map<
      string,
      { cents: number; inputTokens: number; model: string; outputTokens: number; owner: string }
    >()
    for (const r of rows) {
      const key = `${r.owner}|${r.model}`
      const e = agg.get(key)
      if (e) {
        e.cents += r.cents
        e.inputTokens += r.inputTokens
        e.outputTokens += r.outputTokens
      } else
        agg.set(key, {
          cents: r.cents,
          inputTokens: r.inputTokens,
          model: r.model,
          outputTokens: r.outputTokens,
          owner: r.owner
        })
    }
    return [...agg.values()].toSorted((a, b) => b.cents - a.cents)
  }
})
const wipeCostRecords = mutation({
  args: { testSecret: v.string() },
  handler: async (ctx, { testSecret }): Promise<void> => {
    verifyTestSecret(testSecret)
    const rows = await ctx.db.query('costRecords').collect()
    for (const r of rows) await ctx.db.delete(r._id)
  }
})
const topStripProbe = query({
  args: { testSecret: v.string() },
  handler: async (ctx, { testSecret }): Promise<{ cycleCents: number; docsInCorpus: number; totalUsers: number }> => {
    verifyTestSecret(testSecret)
    const usersRows = await ctx.db
      .query('userProfiles')
      .withIndex('by_role', q => q.eq('role', 'user'))
      .take(2000)
    const docs = await ctx.db
      .query('docs')
      .withIndex('by_scope_uploadedAt', q => q.eq('scope', 'shared'))
      .filter(q =>
        q.and(
          q.eq(q.field('deletedAt'), undefined),
          q.eq(q.field('policyStatus'), 'approved'),
          q.eq(q.field('scanStatus'), 'clean')
        )
      )
      .take(5000)
    const costRows = await ctx.db.query('costRecords').take(5000)
    let cycleCents = 0
    for (const r of costRows) cycleCents += r.cents
    return { cycleCents, docsInCorpus: docs.length, totalUsers: usersRows.length }
  }
})
const seedCostRecord = mutation({
  args: { cents: v.number(), dayKey: v.string(), model: v.string(), owner: v.string(), testSecret: v.string() },
  handler: async (ctx, { owner, model, dayKey, cents, testSecret }): Promise<void> => {
    verifyTestSecret(testSecret)
    await ctx.db.insert('costRecords', {
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      callCount: 1,
      cents,
      dayKey,
      inputTokens: 100,
      model,
      outputTokens: 50,
      owner
    })
  }
})
const getTopicPoolCap = query({
  args: { testSecret: v.string(), topicId: v.id('topics') },
  handler: async (ctx, { topicId, testSecret }): Promise<null | { poolCap: number }> => {
    verifyTestSecret(testSecret)
    const t = await ctx.db.get(topicId)
    return t ? { poolCap: t.poolCap } : null
  }
})
const setTopicPoolCap = mutation({
  args: { poolCap: v.number(), testSecret: v.string(), topicId: v.id('topics') },
  handler: async (ctx, { topicId, poolCap, testSecret }): Promise<void> => {
    verifyTestSecret(testSecret)
    await ctx.db.patch(topicId, { poolCap })
  }
})
const markTopicSubstantiveProbe = mutation({
  args: { adminEmail: v.string(), testSecret: v.string(), topicId: v.id('topics') },
  handler: async (
    ctx,
    { topicId, adminEmail, testSecret }
  ): Promise<{ assignmentsCreated: number; passesRevoked: number }> => {
    verifyTestSecret(testSecret)
    const now = Date.now()
    await ctx.db.patch(topicId, { lastSubstantiveUpdate: now })
    const stalePass = await ctx.db
      .query('testPasses')
      .withIndex('by_topic_kind_passedAt', q => q.eq('topicId', topicId).eq('kind', 'assigned'))
      .filter(q => q.lt(q.field('passedAt'), now))
      .take(2000)
    let revoked = 0
    let created = 0
    for (const p of stalePass) {
      await ctx.db.delete(p._id)
      revoked += 1
      const existingRows = await ctx.db
        .query('testAssignments')
        .withIndex('by_user_topic', q => q.eq('userId', p.userId).eq('topicId', topicId))
        .filter(q => q.eq(q.field('deletedAt'), undefined))
        .collect()
      if (!existingRows[0]) {
        await ctx.db.insert('testAssignments', { createdAt: now, createdBy: adminEmail, topicId, userId: p.userId })
        created += 1
      }
    }
    return { assignmentsCreated: created, passesRevoked: revoked }
  }
})
const countTestPasses = query({
  args: { testSecret: v.string(), topicId: v.id('topics') },
  handler: async (ctx, { topicId, testSecret }): Promise<{ assignedKind: number; selfKind: number }> => {
    verifyTestSecret(testSecret)
    const rows = await ctx.db
      .query('testPasses')
      .withIndex('by_topic_kind_passedAt', q => q.eq('topicId', topicId).eq('kind', 'assigned'))
      .take(2000)
    const self = await ctx.db
      .query('testPasses')
      .withIndex('by_topic_kind_passedAt', q => q.eq('topicId', topicId).eq('kind', 'self'))
      .take(2000)
    return { assignedKind: rows.length, selfKind: self.length }
  }
})
const regenerateQuestionProbe = mutation({
  args: {
    adminEmail: v.string(),
    hint: v.optional(v.string()),
    questionId: v.id('testQuestions'),
    testSecret: v.string()
  },
  handler: async (
    ctx,
    { questionId, hint, adminEmail, testSecret }
  ): Promise<{ regenCount: number; suggestionId: string }> => {
    verifyTestSecret(testSecret)
    const q = await ctx.db.get(questionId)
    if (!q) throw new Error('not found')
    const prior = await ctx.db
      .query('testQuestionSuggestions')
      .withIndex('by_target', x => x.eq('targetQuestionId', questionId))
      .collect()
    let lastRegen = 0
    for (const s of prior) lastRegen = Math.max(lastRegen, s.regenCount ?? 0)
    if (lastRegen >= 5) throw new Error('regenCount cap reached (5)')
    const regenCount = lastRegen + 1
    const sid = await ctx.db.insert('testQuestionSuggestions', {
      createdAt: Date.now(),
      hint,
      kind: 'revision',
      regenCount,
      sourceDocIds: q.sourceDocIds,
      status: 'pending',
      targetQuestionId: questionId,
      topicId: q.topicId
    })
    await ctx.db.insert('auditLogs', {
      args: JSON.stringify({ hint: hint?.slice(0, 80), questionId, regenCount }),
      command: 'training.question.regenerate',
      mode: 'session',
      ok: true,
      owner: adminEmail,
      severity: 'medium'
    })
    return { regenCount, suggestionId: sid }
  }
})
const editQuestionProbe = mutation({
  args: {
    choices: v.array(v.string()),
    correctIndex: v.number(),
    prompt: v.string(),
    questionId: v.id('testQuestions'),
    testSecret: v.string()
  },
  handler: async (ctx, { questionId, prompt, choices, correctIndex, testSecret }): Promise<{ revision: number }> => {
    verifyTestSecret(testSecret)
    const q = await ctx.db.get(questionId)
    if (!q) throw new Error('not found')
    const nextRevision = q.revision + 1
    await ctx.db.patch(questionId, { choices, correctIndex, prompt, revision: nextRevision })
    return { revision: nextRevision }
  }
})
const retireQuestionProbe = mutation({
  args: { questionId: v.id('testQuestions'), testSecret: v.string() },
  handler: async (ctx, { questionId, testSecret }): Promise<void> => {
    verifyTestSecret(testSecret)
    await ctx.db.patch(questionId, { deleteReason: 'admin-retire', deletedAt: Date.now() })
  }
})
const getQuestionRow = query({
  args: { questionId: v.id('testQuestions'), testSecret: v.string() },
  handler: async (
    ctx,
    { questionId, testSecret }
  ): Promise<null | {
    choices: string[]
    correctIndex: number
    deletedAt?: number
    deleteReason?: string
    prompt: string
    revision: number
  }> => {
    verifyTestSecret(testSecret)
    const q = await ctx.db.get(questionId)
    if (!q) return null
    return {
      choices: q.choices,
      correctIndex: q.correctIndex,
      deleteReason: q.deleteReason,
      deletedAt: q.deletedAt,
      prompt: q.prompt,
      revision: q.revision
    }
  }
})
const listQuestionsForTopic = query({
  args: { testSecret: v.string(), topicId: v.id('topics') },
  handler: async (ctx, { topicId, testSecret }): Promise<{ _id: string }[]> => {
    verifyTestSecret(testSecret)
    const rows = await ctx.db
      .query('testQuestions')
      .withIndex('by_topic_deletedAt', q => q.eq('topicId', topicId).eq('deletedAt', undefined))
      .take(100)
    return rows.map(r => ({ _id: r._id }))
  }
})
const assignAllForTopicProbe = mutation({
  args: { adminEmail: v.string(), testSecret: v.string(), topicId: v.id('topics') },
  handler: async (ctx, { topicId, adminEmail, testSecret }): Promise<{ assignmentsCreated: number }> => {
    verifyTestSecret(testSecret)
    const pool = await ctx.db
      .query('testQuestions')
      .withIndex('by_topic_deletedAt', q => q.eq('topicId', topicId).eq('deletedAt', undefined))
      .take(6)
    if (pool.length < 5) throw new Error(`pool too small: ${pool.length}/5`)
    const users = await ctx.db
      .query('userProfiles')
      .withIndex('by_role', q => q.eq('role', 'user'))
      .take(2000)
    let created = 0
    for (const u of users) {
      const passRows = await ctx.db
        .query('testPasses')
        .withIndex('by_user_topic_kind', q => q.eq('userId', u.userId).eq('topicId', topicId).eq('kind', 'assigned'))
        .collect()
      if (passRows[0]) continue
      const exRows = await ctx.db
        .query('testAssignments')
        .withIndex('by_user_topic', q => q.eq('userId', u.userId).eq('topicId', topicId))
        .filter(q => q.eq(q.field('deletedAt'), undefined))
        .collect()
      if (exRows[0]) continue
      await ctx.db.insert('testAssignments', { createdAt: Date.now(), createdBy: adminEmail, topicId, userId: u.userId })
      created += 1
    }
    return { assignmentsCreated: created }
  }
})
const unassignAllForTopicProbe = mutation({
  args: { adminEmail: v.string(), testSecret: v.string(), topicId: v.id('topics') },
  handler: async (
    ctx,
    { topicId, adminEmail, testSecret }
  ): Promise<{ assignmentsCancelled: number; inProgressCancelled: number }> => {
    verifyTestSecret(testSecret)
    const rows = await ctx.db
      .query('testAssignments')
      .withIndex('by_topic_deletedAt', q => q.eq('topicId', topicId).eq('deletedAt', undefined))
      .take(2000)
    const now = Date.now()
    let cancelled = 0
    let liveCancelled = 0
    for (const r of rows) {
      await ctx.db.patch(r._id, { deletedAt: now, deletedBy: adminEmail })
      const liveRows = await ctx.db
        .query('testAttempts')
        .withIndex('by_user_topic', q => q.eq('userId', r.userId).eq('topicId', topicId))
        .filter(q => q.eq(q.field('status'), 'in-progress'))
        .collect()
      const live = liveRows[0]
      if (live) {
        await ctx.db.patch(live._id, { cancelledReason: 'assignment-cancelled', status: 'cancelled' })
        liveCancelled += 1
      }
      cancelled += 1
    }
    return { assignmentsCancelled: cancelled, inProgressCancelled: liveCancelled }
  }
})
const adminApproveReviewProbe = mutation({
  args: { adminEmail: v.string(), docId: v.id('docs'), testSecret: v.string() },
  handler: async (ctx, { docId, adminEmail, testSecret }): Promise<void> => {
    verifyTestSecret(testSecret)
    const doc = await ctx.db.get(docId)
    if (!doc) throw new Error('not found')
    await ctx.db.patch(docId, { policyOverriddenBy: adminEmail, policyStatus: 'approved' })
  }
})
const adminConfirmRejectProbe = mutation({
  args: { adminEmail: v.string(), docId: v.id('docs'), testSecret: v.string() },
  handler: async (ctx, { docId, adminEmail, testSecret }): Promise<void> => {
    verifyTestSecret(testSecret)
    const doc = await ctx.db.get(docId)
    if (!doc) throw new Error('not found')
    if (doc.storageId)
      try {
        await ctx.storage.delete(doc.storageId)
      } catch {
        /* Gone */
      }
    await ctx.db.patch(docId, { policyOverriddenBy: adminEmail, storageId: undefined })
  }
})
const adminDeleteDocProbe = mutation({
  args: { adminEmail: v.string(), docId: v.id('docs'), testSecret: v.string() },
  handler: async (
    ctx,
    { docId, adminEmail, testSecret }
  ): Promise<{ pendingSuggestionsCancelled: number; questionsSoftDeleted: number }> => {
    verifyTestSecret(testSecret)
    const doc = await ctx.db.get(docId)
    if (!doc) throw new Error('doc not found')
    await ctx.db.patch(docId, { deletedAt: Date.now() })
    const pending = await ctx.db
      .query('testQuestionSuggestions')
      .filter(q => q.eq(q.field('status'), 'pending'))
      .take(500)
    let pCancelled = 0
    for (const s of pending)
      if (s.sourceDocIds.includes(docId)) {
        await ctx.db.patch(s._id, {
          resolvedAction: 'auto-rejected',
          resolvedAt: Date.now(),
          resolvedBy: adminEmail,
          resolvedReason: 'source-doc-deleted',
          status: 'resolved'
        })
        pCancelled += 1
      }
    const qs = await ctx.db.query('testQuestions').take(2000)
    let qDeleted = 0
    for (const q of qs)
      if (!q.deletedAt && q.sourceDocIds.includes(docId)) {
        await ctx.db.patch(q._id, { deleteReason: 'source-doc-cascade', deletedAt: Date.now() })
        qDeleted += 1
      }
    return { pendingSuggestionsCancelled: pCancelled, questionsSoftDeleted: qDeleted }
  }
})
const seedSuggestionWithDoc = mutation({
  args: { docId: v.id('docs'), testSecret: v.string(), topicId: v.id('topics') },
  handler: async (ctx, { topicId, docId, testSecret }): Promise<string> => {
    verifyTestSecret(testSecret)
    return ctx.db.insert('testQuestionSuggestions', {
      choices: ['A', 'B', 'C'],
      correctIndex: 0,
      createdAt: Date.now(),
      kind: 'new',
      prompt: 'src-doc',
      regenCount: 0,
      sourceDocIds: [docId],
      status: 'pending',
      topicId
    })
  }
})
const seedQuestionWithDoc = mutation({
  args: { docId: v.id('docs'), testSecret: v.string(), topicId: v.id('topics') },
  handler: async (ctx, { topicId, docId, testSecret }): Promise<string> => {
    verifyTestSecret(testSecret)
    return ctx.db.insert('testQuestions', {
      choices: ['A', 'B', 'C'],
      correctIndex: 0,
      createdAt: Date.now(),
      createdBy: 'test',
      prompt: 'q',
      revision: 1,
      sourceDocIds: [docId],
      topicId
    })
  }
})
const adminDeleteTopicProbe = mutation({
  args: { adminEmail: v.string(), testSecret: v.string(), topicId: v.id('topics') },
  handler: async (
    ctx,
    { topicId, adminEmail, testSecret }
  ): Promise<{
    assignmentsCancelled: number
    attemptsCancelled: number
    questionsDeleted: number
    suggestionsResolved: number
  }> => {
    verifyTestSecret(testSecret)
    const now = Date.now()
    await ctx.db.patch(topicId, { deletedAt: now })
    const questions = await ctx.db
      .query('testQuestions')
      .withIndex('by_topic_deletedAt', q => q.eq('topicId', topicId).eq('deletedAt', undefined))
      .take(1000)
    for (const q of questions) await ctx.db.patch(q._id, { deleteReason: 'topic-cascade', deletedAt: now })
    const suggestions = await ctx.db
      .query('testQuestionSuggestions')
      .withIndex('by_topic_status', q => q.eq('topicId', topicId).eq('status', 'pending'))
      .take(1000)
    for (const s of suggestions)
      await ctx.db.patch(s._id, {
        resolvedAction: 'auto-rejected',
        resolvedAt: now,
        resolvedBy: adminEmail,
        resolvedReason: 'topic-deleted',
        status: 'resolved'
      })
    const assignments = await ctx.db
      .query('testAssignments')
      .withIndex('by_topic_deletedAt', q => q.eq('topicId', topicId).eq('deletedAt', undefined))
      .take(2000)
    for (const a of assignments) await ctx.db.patch(a._id, { deletedAt: now, deletedBy: adminEmail })
    const inProgress = await ctx.db
      .query('testAttempts')
      .withIndex('by_topic_status', q => q.eq('topicId', topicId).eq('status', 'in-progress'))
      .take(1000)
    for (const att of inProgress) await ctx.db.patch(att._id, { cancelledReason: 'topic-deleted', status: 'cancelled' })
    return {
      assignmentsCancelled: assignments.length,
      attemptsCancelled: inProgress.length,
      questionsDeleted: questions.length,
      suggestionsResolved: suggestions.length
    }
  }
})
const getTopicRow = query({
  args: { testSecret: v.string(), topicId: v.id('topics') },
  handler: async (ctx, { topicId, testSecret }): Promise<null | { deletedAt?: number; name: string }> => {
    verifyTestSecret(testSecret)
    const t = await ctx.db.get(topicId)
    return t ? { deletedAt: t.deletedAt, name: t.name } : null
  }
})
const seedTestPass = mutation({
  args: {
    kind: v.union(v.literal('self'), v.literal('assigned')),
    testSecret: v.string(),
    topicId: v.id('topics'),
    userId: v.string()
  },
  handler: async (ctx, { userId, topicId, kind, testSecret }): Promise<void> => {
    verifyTestSecret(testSecret)
    const attemptId = await ctx.db.insert('testAttempts', {
      kind,
      questionSnapshots: [],
      score: 5,
      startedAt: Date.now(),
      status: 'passed',
      topicId,
      userId
    })
    await ctx.db.insert('testPasses', {
      attemptId,
      kind,
      passedAt: Date.now(),
      topicId,
      userId
    })
  }
})
const createOrUpdateUserProbe = mutation({
  args: { bootstrapAdmins: v.array(v.string()), email: v.string(), testSecret: v.string() },
  handler: async (ctx, { email, bootstrapAdmins, testSecret }): Promise<{ role: string; userId: string }> => {
    verifyTestSecret(testSecret)
    const dupRows = await ctx.db
      .query('users')
      .filter(q => q.eq(q.field('email'), email))
      .collect()
    const dup = dupRows[0] ?? null
    const userId = dup ? (dup._id as string) : ((await ctx.db.insert('users', { email })) as string)
    const profileRows = await ctx.db
      .query('userProfiles')
      .withIndex('by_userId', q => q.eq('userId', email))
      .collect()
    const existingProfile = profileRows[0] ?? null
    let role: string = existingProfile?.role ?? 'user'
    if (!existingProfile) {
      role = bootstrapAdmins.includes(email) ? 'admin' : 'user'
      await ctx.db.insert('userProfiles', {
        role: role as 'admin' | 'user',
        updatedAt: Date.now(),
        updatedBy: 'self',
        userId: email
      })
    }
    return { role, userId }
  }
})
const listMyTopicsProbe = query({
  args: { testSecret: v.string(), userId: v.string() },
  handler: async (ctx, { testSecret }): Promise<{ _id: string; name: string; poolSize: number }[]> => {
    verifyTestSecret(testSecret)
    const topics = await ctx.db
      .query('topics')
      .withIndex('by_deletedAt', q => q.eq('deletedAt', undefined))
      .take(500)
    const out: { _id: string; name: string; poolSize: number }[] = []
    for (const t of topics) {
      const pool = await ctx.db
        .query('testQuestions')
        .withIndex('by_topic_deletedAt', q => q.eq('topicId', t._id).eq('deletedAt', undefined))
        .take(100)
      if (pool.length > 0) out.push({ _id: t._id, name: t.name, poolSize: pool.length })
    }
    return out
  }
})
const getSuggestionRow = query({
  args: { suggestionId: v.id('testQuestionSuggestions'), testSecret: v.string() },
  handler: async (ctx, { suggestionId, testSecret }) => {
    verifyTestSecret(testSecret)
    return ctx.db.get(suggestionId)
  }
})
const seedSuggestionWithKind = mutation({
  args: {
    kind: v.union(v.literal('new'), v.literal('revision'), v.literal('retire')),
    testSecret: v.string(),
    topicId: v.id('topics')
  },
  handler: async (ctx, { topicId, kind, testSecret }): Promise<string> => {
    verifyTestSecret(testSecret)
    return ctx.db.insert('testQuestionSuggestions', {
      choices: kind === 'retire' ? undefined : ['A', 'B', 'C'],
      correctIndex: kind === 'retire' ? undefined : 0,
      createdAt: Date.now(),
      kind,
      prompt: kind === 'retire' ? undefined : 'q',
      regenCount: 0,
      sourceDocIds: [],
      status: 'pending',
      topicId
    })
  }
})
const seedSuggestion = mutation({
  args: {
    choices: v.array(v.string()),
    correctIndex: v.number(),
    prompt: v.string(),
    testSecret: v.string(),
    topicId: v.id('topics')
  },
  handler: async (ctx, { topicId, prompt, choices, correctIndex, testSecret }): Promise<string> => {
    verifyTestSecret(testSecret)
    return ctx.db.insert('testQuestionSuggestions', {
      choices,
      correctIndex,
      createdAt: Date.now(),
      kind: 'new',
      prompt,
      regenCount: 0,
      sourceDocIds: [],
      status: 'pending',
      topicId
    })
  }
})
const approveSuggestionProbe = mutation({
  args: { adminEmail: v.string(), suggestionId: v.id('testQuestionSuggestions'), testSecret: v.string() },
  handler: async (ctx, { suggestionId, adminEmail, testSecret }): Promise<{ questionId: string }> => {
    verifyTestSecret(testSecret)
    const s = await ctx.db.get(suggestionId)
    if (!(s?.prompt && s.choices) || s.correctIndex === undefined) throw new Error('bad suggestion')
    const qid = await ctx.db.insert('testQuestions', {
      choices: s.choices,
      correctIndex: s.correctIndex,
      createdAt: Date.now(),
      createdBy: adminEmail,
      prompt: s.prompt,
      revision: 1,
      sourceDocIds: s.sourceDocIds,
      topicId: s.topicId
    })
    await ctx.db.patch(suggestionId, {
      resolvedAction: 'approve',
      resolvedAt: Date.now(),
      resolvedBy: adminEmail,
      resolvedReason: 'admin-action',
      status: 'resolved'
    })
    return { questionId: qid }
  }
})
const countTopicQuestions = query({
  args: { testSecret: v.string(), topicId: v.id('topics') },
  handler: async (ctx, { topicId, testSecret }): Promise<number> => {
    verifyTestSecret(testSecret)
    const rows = await ctx.db
      .query('testQuestions')
      .withIndex('by_topic_deletedAt', q => q.eq('topicId', topicId).eq('deletedAt', undefined))
      .take(500)
    return rows.length
  }
})
const seedTopicWithPool = mutation({
  args: { name: v.string(), poolSize: v.number(), testSecret: v.string() },
  handler: async (ctx, { name, poolSize, testSecret }): Promise<string> => {
    verifyTestSecret(testSecret)
    const topicId = await ctx.db.insert('topics', {
      autoLabeled: true,
      createdAt: Date.now(),
      name,
      poolCap: 50
    })
    for (let i = 0; i < poolSize; i += 1)
      await ctx.db.insert('testQuestions', {
        choices: ['A', 'B', 'C'],
        correctIndex: 0,
        createdAt: Date.now(),
        createdBy: 'test',
        prompt: `Q${i}`,
        revision: 1,
        sourceDocIds: [],
        topicId
      })
    return topicId
  }
})
const runAutoAssign = action({
  args: { testSecret: v.string() },
  handler: async (
    ctx,
    { testSecret }
  ): Promise<{ assignmentsCreated: number; durationMs: number; topicsProcessed: number }> => {
    verifyTestSecret(testSecret)
    return ctx.runAction(internal.training.autoAssign, {})
  }
})
const countAssignmentsByCreator = query({
  args: { createdBy: v.string(), testSecret: v.string() },
  handler: async (ctx, { createdBy, testSecret }): Promise<number> => {
    verifyTestSecret(testSecret)
    const rows = await ctx.db.query('testAssignments').collect()
    return rows.filter(r => r.createdBy === createdBy && r.deletedAt === undefined).length
  }
})
const wipeTrainingTables = mutation({
  args: { testSecret: v.string() },
  handler: async (ctx, { testSecret }): Promise<void> => {
    verifyTestSecret(testSecret)
    for (const tbl of [
      'testAssignments',
      'testPasses',
      'testAttempts',
      'testQuestions',
      'testQuestionSuggestions',
      'topics'
    ] as const) {
      const rows = await ctx.db.query(tbl).collect()
      for (const r of rows) await ctx.db.delete(r._id)
    }
  }
})
const softDeleteDocProbe = mutation({
  args: { docId: v.id('docs'), testSecret: v.string() },
  handler: async (ctx, { docId, testSecret }): Promise<void> => {
    verifyTestSecret(testSecret)
    await ctx.db.patch(docId, { deletedAt: Date.now() })
  }
})
const ageDocDeletedAt = mutation({
  args: { ageMs: v.number(), docId: v.id('docs'), testSecret: v.string() },
  handler: async (ctx, { ageMs, docId, testSecret }): Promise<void> => {
    verifyTestSecret(testSecret)
    await ctx.db.patch(docId, { deletedAt: Date.now() - ageMs })
  }
})
const runPurgeSoftDeleted = action({
  args: { testSecret: v.string() },
  handler: async (ctx, { testSecret }): Promise<{ blobsPurged: number; chunksPurged: number }> => {
    verifyTestSecret(testSecret)
    return ctx.runMutation(internal.docs.purgeSoftDeleted, {})
  }
})
const wipeUserProfiles = mutation({
  args: { testSecret: v.string() },
  handler: async (ctx, { testSecret }): Promise<number> => {
    verifyTestSecret(testSecret)
    const rows = await ctx.db.query('userProfiles').collect()
    for (const r of rows) await ctx.db.delete(r._id)
    return rows.length
  }
})
const countChunksForDoc = query({
  args: { docId: v.id('docs'), testSecret: v.string() },
  handler: async (ctx, { docId, testSecret }): Promise<{ count: number; firstEnd?: number; firstStart?: number }> => {
    verifyTestSecret(testSecret)
    const rows = await ctx.db
      .query('docChunks')
      .withIndex('by_doc', q => q.eq('docId', docId))
      .collect()
    return { count: rows.length, firstEnd: rows[0]?.end, firstStart: rows[0]?.start }
  }
})
const setChatStreaming = mutation({
  args: { chatId: v.id('chats'), streaming: v.boolean(), testSecret: v.string() },
  handler: async (ctx, { chatId, streaming, testSecret }): Promise<void> => {
    verifyTestSecret(testSecret)
    await ctx.db.patch(chatId, { streaming })
  }
})
const insertStreamEventProbe = mutation({
  args: { chatId: v.id('chats'), content: v.string(), seq: v.number(), testSecret: v.string() },
  handler: async (ctx, { chatId, content, seq, testSecret }): Promise<{ error?: string; ok: boolean }> => {
    verifyTestSecret(testSecret)
    const rows = await ctx.db
      .query('streamEvents')
      .withIndex('by_chat_seq', q => q.eq('chatId', chatId).eq('seq', seq))
      .collect()
    if (rows[0]) return { error: 'duplicate seq', ok: false }
    const runtimeRows = await ctx.db
      .query('chatRuntime')
      .withIndex('by_chat', q => q.eq('chatId', chatId))
      .collect()
    const rt = runtimeRows[0]
    await (rt
      ? ctx.db.patch(rt._id, { streamEventCount: rt.streamEventCount + 1 })
      : ctx.db.insert('chatRuntime', { chatId, streamEventCount: 1 }))
    await ctx.db.insert('streamEvents', { chatId, content, seq })
    return { ok: true }
  }
})
const listStreamEventsForChat = query({
  args: { chatId: v.id('chats'), testSecret: v.string() },
  handler: async (ctx, { chatId, testSecret }): Promise<{ content: string; seq: number }[]> => {
    verifyTestSecret(testSecret)
    const rows = await ctx.db
      .query('streamEvents')
      .withIndex('by_chat', q => q.eq('chatId', chatId))
      .take(50)
    return rows.map(r => ({ content: r.content, seq: r.seq }))
  }
})
const ageQuarantineRow = mutation({
  args: { ageMs: v.number(), docId: v.id('docs'), testSecret: v.string() },
  handler: async (ctx, { ageMs, docId, testSecret }): Promise<void> => {
    verifyTestSecret(testSecret)
    await ctx.db.patch(docId, { uploadedAt: Date.now() - ageMs })
  }
})
const runQuarantinePurge = action({
  args: { testSecret: v.string() },
  handler: async (ctx, { testSecret }): Promise<{ blobsPurged: number; rowsTouched: number }> => {
    verifyTestSecret(testSecret)
    return ctx.runMutation(internal.docs.purgeQuarantineStaging, {})
  }
})
const ensureChatRuntime = mutation({
  args: { chatId: v.id('chats'), testSecret: v.string() },
  handler: async (ctx, { chatId, testSecret }): Promise<void> => {
    verifyTestSecret(testSecret)
    const rows = await ctx.db
      .query('chatRuntime')
      .withIndex('by_chat', q => q.eq('chatId', chatId))
      .collect()
    const existing = rows[0]
    await (existing
      ? ctx.db.patch(existing._id, { proxyCallsThisTurn: 0, streamEventCount: 0 })
      : ctx.db.insert('chatRuntime', { chatId, proxyCallsThisTurn: 0, streamEventCount: 0 }))
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
  adminApproveReviewProbe,
  adminConfirmRejectProbe,
  adminDeleteDocProbe,
  adminDeleteTopicProbe,
  ageDocDeletedAt,
  ageQuarantineRow,
  approveSuggestionProbe,
  assignAllForTopicProbe,
  attemptDetailProbe,
  checkRateLimitProbe,
  claimContextProbe,
  clearStreamingFlagsInternal,
  consumeProxyBudgetProbe,
  costCyclePivotProbe,
  countAdmins,
  countAssignmentsByCreator,
  countAuditLogs,
  countChunksForDoc,
  countCostRecords,
  countOwnerSpend,
  countTestPasses,
  countTestSuggestions,
  countTopicQuestions,
  createOrUpdateUserProbe,
  docsFinalize,
  docsGenerateUploadUrl,
  downloadZip,
  editQuestionProbe,
  ensureChatRuntime,
  getChatStreaming,
  getDocRow,
  getQuestionRow,
  getSetting,
  getSuggestionRow,
  getTopicPoolCap,
  getTopicRow,
  getUserProfile,
  gradebookProbe,
  gradebookWithDeptProbe,
  heartbeatProbe,
  insertStreamEventProbe,
  listChats,
  listDocsByOwner,
  listFiles,
  listMessages,
  listMyTopicsProbe,
  listQuestionsForTopic,
  listSandboxIds,
  listStreamEvents,
  listStreamEventsForChat,
  listUsersProbe,
  markTopicSubstantiveProbe,
  readFile,
  regenerateQuestionProbe,
  removeChat,
  requestReviewProbe,
  reserveBudgetProbe,
  resetPolicyPending,
  retireQuestionProbe,
  runAutoAssign,
  runPurgeSoftDeleted,
  runQuarantinePurge,
  scanOverrideProbe,
  seedAssignment,
  seedCostRecord,
  seedQuestionWithDoc,
  seedSuggestion,
  seedSuggestionWithDoc,
  seedSuggestionWithKind,
  seedTestPass,
  seedTopicWithPool,
  seedUserProfile,
  send,
  sendCheckTokenProbe,
  sendWithSecret,
  setChatStreaming,
  setSetting,
  setTopicPoolCap,
  setUserDepartmentProbe,
  setUserRoleProbe,
  softDeleteDocProbe,
  startAttemptProbe,
  submitAttemptProbe,
  topStripProbe,
  unassignAllForTopicProbe,
  uploadFile,
  whoAmIProbe,
  wipeAllForOwner,
  wipeCostRecords,
  wipeDocs,
  wipeTrainingTables,
  wipeUserProfiles
}
