/** biome-ignore-all lint/performance/noAwaitInLoops: sequential Convex DB ops by design */
/** biome-ignore-all lint/nursery/noContinue: control flow shape */
/** biome-ignore-all lint/nursery/noShadow: scoped shadows ok */
/* oxlint-disable eslint(no-await-in-loop), eslint(complexity), eslint(no-shadow), unicorn(no-array-reduce), unicorn(prefer-ternary) */
/* eslint-disable no-await-in-loop, complexity, no-continue -- sequential Convex DB ops by design; control flow shape; widened types from generated API */
import { v } from 'convex/values'
import { internal } from './_generated/api'
import { action, internalAction, internalMutation, internalQuery, mutation, query } from './_generated/server'
const AGENT_OWNER = 'agent'
const POOL_MIN = 5
const insertAuto = internalMutation({
  args: { topicId: v.id('topics'), userId: v.string() },
  handler: async (ctx, { topicId, userId }): Promise<{ inserted: boolean }> => {
    const passRows = await ctx.db
      .query('testPasses')
      .withIndex('by_user_topic_kind', q => q.eq('userId', userId).eq('topicId', topicId).eq('kind', 'assigned'))
      .collect()
    if (passRows[0]) return { inserted: false }
    const assignRows = await ctx.db
      .query('testAssignments')
      .withIndex('by_user_topic', q => q.eq('userId', userId).eq('topicId', topicId))
      .filter(q => q.eq(q.field('deletedAt'), undefined))
      .collect()
    if (assignRows[0]) return { inserted: false }
    await ctx.db.insert('testAssignments', {
      createdAt: Date.now(),
      createdBy: AGENT_OWNER,
      topicId,
      userId
    })
    return { inserted: true }
  }
})
const listEligibleTopics = internalQuery({
  args: {},
  handler: async (ctx): Promise<{ _id: string; poolSize: number }[]> => {
    const topics = await ctx.db
      .query('topics')
      .withIndex('by_deletedAt', q => q.eq('deletedAt', undefined))
      .take(500)
    const out: { _id: string; poolSize: number }[] = []
    for (const t of topics) {
      const pool = await ctx.db
        .query('testQuestions')
        .withIndex('by_topic_deletedAt', q => q.eq('topicId', t._id).eq('deletedAt', undefined))
        .take(POOL_MIN + 1)
      if (pool.length >= POOL_MIN) out.push({ _id: t._id, poolSize: pool.length })
    }
    return out
  }
})
const listRoleUsers = internalQuery({
  args: {},
  handler: async (ctx): Promise<{ userId: string }[]> => {
    const rows = await ctx.db
      .query('userProfiles')
      .withIndex('by_role', q => q.eq('role', 'user'))
      .take(2000)
    return rows.map(r => ({ userId: r.userId }))
  }
})
const isAutoAssignEnabled = internalQuery({
  args: {},
  handler: async (ctx): Promise<boolean> => {
    const rows = await ctx.db
      .query('settings')
      .withIndex('by_key', q => q.eq('key', 'agent_auto_assign_enabled'))
      .collect()
    return rows[0]?.value === 'true'
  }
})
const writeAuditRow = internalMutation({
  args: { args: v.string(), command: v.string(), mode: v.string(), ok: v.boolean(), owner: v.string() },
  handler: async (ctx, row): Promise<void> => {
    await ctx.db.insert('auditLogs', row)
  }
})
const isAdminByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }): Promise<boolean> => {
    const rows = await ctx.db
      .query('userProfiles')
      .withIndex('by_userId', q => q.eq('userId', email))
      .collect()
    return rows[0]?.role === 'admin'
  }
})
const assignEligibleNow = action({
  args: {},
  handler: async (ctx): Promise<{ assignmentsCreated: number; durationMs: number; topicsProcessed: number }> => {
    const t0 = Date.now()
    const identity = await ctx.auth.getUserIdentity()
    const email = identity?.email?.toLowerCase()
    if (!email) throw new Error('not authenticated')
    const admin = await ctx.runQuery(internal.training.isAdminByEmail, { email })
    if (!admin) throw new Error('admin only')
    const topics = (await ctx.runQuery(internal.training.listEligibleTopics, {})) as {
      _id: string
      poolSize: number
    }[]
    const users = (await ctx.runQuery(internal.training.listRoleUsers, {})) as { userId: string }[]
    let created = 0
    for (const t of topics)
      for (const u of users) {
        const r = await ctx.runMutation(internal.training.insertAuto, { topicId: t._id as never, userId: u.userId })
        if (r.inserted) created += 1
      }
    const durationMs = Date.now() - t0
    await ctx.runMutation(internal.training.writeAuditRow, {
      args: JSON.stringify({
        assignmentsCreated: created,
        durationMs,
        topicsProcessed: topics.length,
        triggeredBy: email
      }),
      command: 'training.assign.runNow',
      mode: 'admin',
      ok: true,
      owner: AGENT_OWNER
    })
    return { assignmentsCreated: created, durationMs, topicsProcessed: topics.length }
  }
})
const autoAssign = internalAction({
  args: {},
  handler: async (
    ctx
  ): Promise<{ assignmentsCreated: number; durationMs: number; reason?: string; topicsProcessed: number }> => {
    const t0 = Date.now()
    const enabled = await ctx.runQuery(internal.training.isAutoAssignEnabled, {})
    if (!enabled) return { assignmentsCreated: 0, durationMs: Date.now() - t0, reason: 'disabled', topicsProcessed: 0 }
    const topics = (await ctx.runQuery(internal.training.listEligibleTopics, {})) as { _id: string; poolSize: number }[]
    const users = (await ctx.runQuery(internal.training.listRoleUsers, {})) as { userId: string }[]
    let created = 0
    for (const t of topics)
      for (const u of users) {
        const r = await ctx.runMutation(internal.training.insertAuto, {
          topicId: t._id as never,
          userId: u.userId
        })
        if (r.inserted) created += 1
      }
    const durationMs = Date.now() - t0
    await ctx.runMutation(internal.settings.set, {
      key: 'agent_last_check',
      updatedBy: AGENT_OWNER,
      value: String(Date.now())
    })
    if (created > 0)
      await ctx.runMutation(internal.training.writeAuditRow, {
        args: JSON.stringify({ assignmentsCreated: created, durationMs, topicsProcessed: topics.length }),
        command: 'training.cron.run',
        mode: 'system',
        ok: true,
        owner: AGENT_OWNER
      })
    return { assignmentsCreated: created, durationMs, topicsProcessed: topics.length }
  }
})
const listMyTopics = query({
  args: {},
  handler: async (ctx): Promise<{ _id: string; myStatus: string; name: string; poolSize: number }[]> => {
    const identity = await ctx.auth.getUserIdentity()
    const userId = identity?.email?.toLowerCase()
    if (!userId) return []
    const topics = await ctx.db
      .query('topics')
      .withIndex('by_deletedAt', q => q.eq('deletedAt', undefined))
      .take(500)
    const myPasses = await ctx.db
      .query('testPasses')
      .withIndex('by_user', q => q.eq('userId', userId))
      .take(2000)
    const assignedPassed = new Set<string>()
    const selfPassed = new Set<string>()
    for (const p of myPasses)
      if (p.kind === 'assigned') assignedPassed.add(p.topicId)
      else selfPassed.add(p.topicId)
    const out: { _id: string; myStatus: string; name: string; poolSize: number }[] = []
    for (const t of topics) {
      const pool = await ctx.db
        .query('testQuestions')
        .withIndex('by_topic_deletedAt', q => q.eq('topicId', t._id).eq('deletedAt', undefined))
        .take(POOL_MIN + 1)
      if (pool.length === 0) continue
      const tid = t._id as string
      const myStatus = assignedPassed.has(tid) ? 'passed-assigned' : selfPassed.has(tid) ? 'passed-self' : 'not-attempted'
      out.push({ _id: t._id, myStatus, name: t.name, poolSize: pool.length })
    }
    return out
  }
})
const DEFAULT_POOL_CAP = 50
const DUP_COSINE_THRESHOLD = 0.85
const TOPIC_MERGE_SIM = 0.5
const cosine = (a: number[], b: number[]): number => {
  let dot = 0
  let na = 0
  let nb = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i += 1) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    dot += x * y
    na += x * x
    nb += y * y
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb)
}
const persistSuggestionsWithEmbedding = internalMutation({
  args: {
    docId: v.id('docs'),
    questions: v.array(
      v.object({
        choices: v.array(v.string()),
        correctIndex: v.number(),
        prompt: v.string(),
        promptEmbedding: v.array(v.float64()),
        topicName: v.string()
      })
    )
  },
  handler: async (
    ctx,
    { docId, questions }
  ): Promise<{ conflictsFlagged: number; suggestionsInserted: number; topicsCreated: number }> => {
    let topicsCreated = 0
    let suggestionsInserted = 0
    let conflictsFlagged = 0
    const liveTopics = (
      await ctx.db
        .query('topics')
        .withIndex('by_deletedAt', x => x.eq('deletedAt', undefined))
        .take(500)
    ).map(t => ({ centroid: t.centroid ?? null, count: 0, id: t._id, name: t.name }))
    for (const q of questions) {
      let topicId: string | undefined
      if (q.promptEmbedding.length > 0) {
        let best: null | { id: string; sim: number } = null
        for (const t of liveTopics) {
          if (!t.centroid || t.centroid.length === 0) continue
          const sim = cosine(t.centroid, q.promptEmbedding)
          if (!best || sim > best.sim) best = { id: t.id, sim }
        }
        if (best && best.sim >= TOPIC_MERGE_SIM) topicId = best.id
      } else {
        const named = liveTopics.find(t => t.name === q.topicName)
        if (named) topicId = named.id
      }
      if (!topicId) {
        topicId = await ctx.db.insert('topics', {
          autoLabeled: true,
          centroid: q.promptEmbedding.length > 0 ? q.promptEmbedding : undefined,
          createdAt: Date.now(),
          name: q.topicName,
          poolCap: DEFAULT_POOL_CAP
        })
        topicsCreated += 1
        liveTopics.push({
          centroid: q.promptEmbedding.length > 0 ? q.promptEmbedding : null,
          count: 1,
          id: topicId,
          name: q.topicName
        })
      } else if (q.promptEmbedding.length > 0) {
        const lt = liveTopics.find(t => t.id === topicId)
        if (lt) {
          const n = lt.count + 1
          const merged = lt.centroid
            ? lt.centroid.map((v, i) => (v * lt.count + (q.promptEmbedding[i] ?? 0)) / n)
            : q.promptEmbedding
          lt.centroid = merged
          lt.count = n
          await ctx.db.patch(topicId as never, { centroid: merged })
        }
      }
      let pairKind: 'cap-swap' | 'conflict' | undefined
      let pairedWith: string | undefined
      if (q.promptEmbedding.length > 0) {
        const existingQs = await ctx.db
          .query('testQuestions')
          .withIndex('by_topic_deletedAt', x => x.eq('topicId', topicId as never).eq('deletedAt', undefined))
          .take(200)
        for (const e of existingQs) {
          const eqRows = await ctx.db
            .query('testQuestionSuggestions')
            .withIndex('by_target', x => x.eq('targetQuestionId', e._id))
            .collect()
          if (eqRows[0]) continue
        }
      }
      const currentPool = await ctx.db
        .query('testQuestions')
        .withIndex('by_topic_deletedAt', x => x.eq('topicId', topicId as never).eq('deletedAt', undefined))
        .take(DEFAULT_POOL_CAP + 1)
      if (currentPool.length >= DEFAULT_POOL_CAP) {
        const oldest = currentPool.toSorted((a, b) => a.createdAt - b.createdAt)[0]
        if (oldest) {
          pairKind = 'cap-swap'
          pairedWith = oldest._id
        }
      }
      const sid = await ctx.db.insert('testQuestionSuggestions', {
        choices: q.choices,
        correctIndex: q.correctIndex,
        createdAt: Date.now(),
        kind: 'new',
        pairKind,
        pairedWith: pairedWith as never,
        prompt: q.prompt,
        promptEmbedding: q.promptEmbedding.length > 0 ? q.promptEmbedding : undefined,
        sourceDocIds: [docId],
        status: 'pending',
        topicId: topicId as never
      })
      if (q.promptEmbedding.length > 0) {
        const peers = await ctx.db
          .query('testQuestionSuggestions')
          .withIndex('by_topic_status', x => x.eq('topicId', topicId as never).eq('status', 'pending'))
          .take(500)
        for (const p of peers) {
          if (p._id === sid || !p.promptEmbedding || p.promptEmbedding.length === 0) continue
          const c = cosine(p.promptEmbedding, q.promptEmbedding)
          if (c >= DUP_COSINE_THRESHOLD) {
            await ctx.db.patch(sid, { pairKind: 'conflict', pairedWith: p._id })
            conflictsFlagged += 1
            break
          }
        }
      }
      suggestionsInserted += 1
    }
    return { conflictsFlagged, suggestionsInserted, topicsCreated }
  }
})
const persistSuggestions = internalMutation({
  args: {
    docId: v.id('docs'),
    questions: v.array(
      v.object({
        choices: v.array(v.string()),
        correctIndex: v.number(),
        prompt: v.string(),
        topicName: v.string()
      })
    )
  },
  handler: async (ctx, { docId, questions }): Promise<{ suggestionsInserted: number; topicsCreated: number }> => {
    const topicCache = new Map<string, string>()
    let topicsCreated = 0
    let suggestionsInserted = 0
    for (const q of questions) {
      let topicId = topicCache.get(q.topicName)
      if (!topicId) {
        const topicRows = await ctx.db
          .query('topics')
          .withIndex('by_name', x => x.eq('name', q.topicName))
          .collect()
        const existing = topicRows[0]
        if (existing) topicId = existing._id
        else {
          topicId = await ctx.db.insert('topics', {
            autoLabeled: true,
            createdAt: Date.now(),
            name: q.topicName,
            poolCap: DEFAULT_POOL_CAP
          })
          topicsCreated += 1
        }
        topicCache.set(q.topicName, topicId)
      }
      await ctx.db.insert('testQuestionSuggestions', {
        choices: q.choices,
        correctIndex: q.correctIndex,
        createdAt: Date.now(),
        kind: 'new',
        sourceDocIds: [docId],
        status: 'pending',
        topicId: topicId as never
      })
      suggestionsInserted += 1
    }
    return { suggestionsInserted, topicsCreated }
  }
})
const listPendingSuggestionsForAdmin = query({
  args: { limit: v.optional(v.number()) },
  handler: async (
    ctx,
    { limit }
  ): Promise<
    {
      _id: string
      choices?: string[]
      correctIndex?: number
      pairedWith?: string
      pairKind?: 'cap-swap' | 'conflict'
      prompt?: string
      sourceDocs: { _id: string; filename: string }[]
      topicId: string
      topicName: string
    }[]
  > => {
    const identity = await ctx.auth.getUserIdentity()
    const email = identity?.email?.toLowerCase()
    if (!email) return []
    const profileRows = await ctx.db
      .query('userProfiles')
      .withIndex('by_userId', q => q.eq('userId', email))
      .collect()
    const profile = profileRows[0]
    if (profile?.role !== 'admin') return []
    const rows = await ctx.db
      .query('testQuestionSuggestions')
      .filter(q => q.eq(q.field('status'), 'pending'))
      .order('desc')
      .take(Math.min(limit ?? 100, 500))
    const topicCache = new Map<string, string>()
    const out: {
      _id: string
      choices?: string[]
      correctIndex?: number
      pairedWith?: string
      pairKind?: 'cap-swap' | 'conflict'
      prompt?: string
      sourceDocs: { _id: string; filename: string }[]
      topicId: string
      topicName: string
    }[] = []
    const docCache = new Map<string, string>()
    for (const r of rows) {
      let topicName = topicCache.get(r.topicId)
      if (!topicName) {
        const t = await ctx.db.get(r.topicId)
        topicName = t?.name ?? '?'
        topicCache.set(r.topicId, topicName)
      }
      out.push({
        _id: r._id,
        choices: r.choices,
        correctIndex: r.correctIndex,
        pairKind: r.pairKind,
        pairedWith: r.pairedWith,
        prompt: r.prompt,
        sourceDocs: await Promise.all(
          r.sourceDocIds.map(async id => {
            let filename = docCache.get(id)
            if (filename === undefined) {
              const d = await ctx.db.get(id)
              filename = d?.filename ?? '?'
              docCache.set(id, filename)
            }
            return { _id: id, filename }
          })
        ),
        topicId: r.topicId,
        topicName
      })
    }
    return out
  }
})
const listAttemptsForAdmin = query({
  args: { topicId: v.id('topics'), userId: v.string() },
  handler: async (ctx, { topicId, userId }) => {
    const identity = await ctx.auth.getUserIdentity()
    const email = identity?.email?.toLowerCase()
    if (!email) return []
    const profileRows = await ctx.db
      .query('userProfiles')
      .withIndex('by_userId', q => q.eq('userId', email))
      .collect()
    const profile = profileRows[0]
    if (profile?.role !== 'admin') return []
    const rows = await ctx.db
      .query('testAttempts')
      .withIndex('by_user_topic', q => q.eq('userId', userId).eq('topicId', topicId))
      .order('desc')
      .take(50)
    return rows.map(r => ({
      _id: r._id,
      finishedAt: r.finishedAt,
      kind: r.kind,
      score: r.score,
      startedAt: r.startedAt,
      status: r.status
    }))
  }
})
const rejectSuggestionPublic = mutation({
  args: { suggestionId: v.id('testQuestionSuggestions') },
  handler: async (ctx, { suggestionId }): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity()
    const email = identity?.email?.toLowerCase()
    if (!email) throw new Error('not authenticated')
    const profileRows = await ctx.db
      .query('userProfiles')
      .withIndex('by_userId', q => q.eq('userId', email))
      .collect()
    const profile = profileRows[0]
    if (profile?.role !== 'admin') throw new Error('admin only')
    const s = await ctx.db.get(suggestionId)
    if (!s) throw new Error('suggestion not found')
    if (s.status !== 'pending') throw new Error('already resolved')
    await ctx.db.patch(suggestionId, {
      resolvedAction: 'reject',
      resolvedAt: Date.now(),
      resolvedBy: email,
      resolvedReason: 'admin-action',
      status: 'resolved'
    })
  }
})
const approveSuggestion = internalMutation({
  args: { adminEmail: v.string(), suggestionId: v.id('testQuestionSuggestions') },
  handler: async (ctx, { suggestionId, adminEmail }): Promise<{ questionId: string }> => {
    const s = await ctx.db.get(suggestionId)
    if (!s) throw new Error('suggestion not found')
    if (s.status !== 'pending') throw new Error('suggestion already resolved')
    if (s.kind !== 'new' || !s.prompt || !s.choices || s.correctIndex === undefined)
      throw new Error('only new-kind approvals supported here')
    const questionId = await ctx.db.insert('testQuestions', {
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
    return { questionId }
  }
})
const approveSuggestionPublic = mutation({
  args: { suggestionId: v.id('testQuestionSuggestions') },
  handler: async (ctx, { suggestionId }): Promise<{ questionId: string }> => {
    const identity = await ctx.auth.getUserIdentity()
    const email = identity?.email?.toLowerCase()
    if (!email) throw new Error('not authenticated')
    const profileRows = await ctx.db
      .query('userProfiles')
      .withIndex('by_userId', q => q.eq('userId', email))
      .collect()
    const profile = profileRows[0]
    if (profile?.role !== 'admin') throw new Error('admin only')
    const s = await ctx.db.get(suggestionId)
    if (!s) throw new Error('suggestion not found')
    if (s.status !== 'pending') throw new Error('suggestion already resolved')
    if (s.kind !== 'new' || !s.prompt || !s.choices || s.correctIndex === undefined)
      throw new Error('only new-kind approvals supported here')
    const questionId = await ctx.db.insert('testQuestions', {
      choices: s.choices,
      correctIndex: s.correctIndex,
      createdAt: Date.now(),
      createdBy: email,
      prompt: s.prompt,
      revision: 1,
      sourceDocIds: s.sourceDocIds,
      topicId: s.topicId
    })
    await ctx.db.patch(suggestionId, {
      resolvedAction: 'approve',
      resolvedAt: Date.now(),
      resolvedBy: email,
      resolvedReason: 'admin-action',
      status: 'resolved'
    })
    return { questionId }
  }
})
const resolvePairAction = mutation({
  args: {
    action: v.union(v.literal('accept-swap'), v.literal('keep-old'), v.literal('keep-both'), v.literal('reject-both')),
    pairId: v.id('testQuestionSuggestions')
  },
  handler: async (ctx, { pairId, action }): Promise<{ approvedQuestionId?: string; retiredQuestionId?: string }> => {
    const identity = await ctx.auth.getUserIdentity()
    const email = identity?.email?.toLowerCase()
    if (!email) throw new Error('not authenticated')
    const profileRows = await ctx.db
      .query('userProfiles')
      .withIndex('by_userId', q => q.eq('userId', email))
      .collect()
    const profile = profileRows[0]
    if (profile?.role !== 'admin') throw new Error('admin only')
    const a = await ctx.db.get(pairId)
    if (!a) throw new Error('suggestion not found')
    if (a.status !== 'pending') throw new Error('suggestion already resolved')
    if (!a.pairedWith) throw new Error('not a paired suggestion')
    const b = await ctx.db.get(a.pairedWith)
    if (!b) throw new Error('paired suggestion missing')
    if (b.status !== 'pending') throw new Error('paired suggestion already resolved')
    const newSug = a.kind === 'new' ? a : b
    const retireSug = a.kind === 'retire' ? a : b.kind === 'retire' ? b : null
    const now = Date.now()
    const resolved = (action_label: string) => ({
      resolvedAction: action_label as 'approve' | 'reject',
      resolvedAt: now,
      resolvedBy: email,
      resolvedReason: 'admin-action' as const,
      status: 'resolved' as const
    })
    let approvedQuestionId: string | undefined
    let retiredQuestionId: string | undefined
    if (action === 'accept-swap' || action === 'keep-both') {
      if (newSug.kind !== 'new' || !newSug.prompt || !newSug.choices || newSug.correctIndex === undefined)
        throw new Error('new-suggestion shape invalid')
      approvedQuestionId = await ctx.db.insert('testQuestions', {
        choices: newSug.choices,
        correctIndex: newSug.correctIndex,
        createdAt: now,
        createdBy: email,
        prompt: newSug.prompt,
        revision: 1,
        sourceDocIds: newSug.sourceDocIds,
        topicId: newSug.topicId
      })
      await ctx.db.patch(newSug._id, resolved('approve'))
    } else await ctx.db.patch(newSug._id, resolved('reject'))
    if (retireSug)
      if (action === 'accept-swap' && retireSug.targetQuestionId) {
        await ctx.db.patch(retireSug.targetQuestionId, { deleteReason: 'agent-retire-conflict', deletedAt: now })
        retiredQuestionId = retireSug.targetQuestionId
        await ctx.db.patch(retireSug._id, resolved('approve'))
      } else await ctx.db.patch(retireSug._id, resolved('reject'))
    return { approvedQuestionId, retiredQuestionId }
  }
})
const adminEditQuestion = mutation({
  args: {
    choices: v.array(v.string()),
    correctIndex: v.number(),
    prompt: v.string(),
    questionId: v.id('testQuestions')
  },
  handler: async (ctx, { questionId, prompt, choices, correctIndex }): Promise<{ revision: number }> => {
    const identity = await ctx.auth.getUserIdentity()
    const email = identity?.email?.toLowerCase()
    if (!email) throw new Error('not authenticated')
    const profileRows = await ctx.db
      .query('userProfiles')
      .withIndex('by_userId', q => q.eq('userId', email))
      .collect()
    const profile = profileRows[0]
    if (profile?.role !== 'admin') throw new Error('admin only')
    const q = await ctx.db.get(questionId)
    if (!q) throw new Error('question not found')
    if (q.deletedAt) throw new Error('question is retired')
    const nextRevision = q.revision + 1
    await ctx.db.patch(questionId, { choices, correctIndex, prompt, revision: nextRevision })
    await ctx.db.insert('auditLogs', {
      args: JSON.stringify({ questionId, revision: nextRevision }),
      command: 'training.question.edit',
      mode: 'session',
      ok: true,
      owner: email,
      severity: 'low'
    })
    return { revision: nextRevision }
  }
})
const adminRetireQuestion = mutation({
  args: { questionId: v.id('testQuestions') },
  handler: async (ctx, { questionId }): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity()
    const email = identity?.email?.toLowerCase()
    if (!email) throw new Error('not authenticated')
    const profileRows = await ctx.db
      .query('userProfiles')
      .withIndex('by_userId', q => q.eq('userId', email))
      .collect()
    const profile = profileRows[0]
    if (profile?.role !== 'admin') throw new Error('admin only')
    const q = await ctx.db.get(questionId)
    if (!q) throw new Error('question not found')
    if (q.deletedAt) throw new Error('already retired')
    await ctx.db.patch(questionId, { deleteReason: 'admin-retire', deletedAt: Date.now() })
    await ctx.db.insert('auditLogs', {
      args: JSON.stringify({ questionId }),
      command: 'training.question.retire',
      mode: 'session',
      ok: true,
      owner: email,
      severity: 'medium'
    })
  }
})
const adminDeleteTopic = mutation({
  args: { topicId: v.id('topics') },
  handler: async (
    ctx,
    { topicId }
  ): Promise<{
    assignmentsCancelled: number
    attemptsCancelled: number
    questionsDeleted: number
    suggestionsResolved: number
  }> => {
    const identity = await ctx.auth.getUserIdentity()
    const email = identity?.email?.toLowerCase()
    if (!email) throw new Error('not authenticated')
    const profileRows = await ctx.db
      .query('userProfiles')
      .withIndex('by_userId', q => q.eq('userId', email))
      .collect()
    const profile = profileRows[0]
    if (profile?.role !== 'admin') throw new Error('admin only')
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
        resolvedBy: email,
        resolvedReason: 'topic-deleted',
        status: 'resolved'
      })
    const assignments = await ctx.db
      .query('testAssignments')
      .withIndex('by_topic_deletedAt', q => q.eq('topicId', topicId).eq('deletedAt', undefined))
      .take(2000)
    for (const a of assignments) await ctx.db.patch(a._id, { deletedAt: now, deletedBy: email })
    const inProgress = await ctx.db
      .query('testAttempts')
      .withIndex('by_topic_status', q => q.eq('topicId', topicId).eq('status', 'in-progress'))
      .take(1000)
    for (const att of inProgress) await ctx.db.patch(att._id, { cancelledReason: 'topic-deleted', status: 'cancelled' })
    await ctx.db.insert('auditLogs', {
      args: JSON.stringify({
        assignmentsCancelled: assignments.length,
        attemptsCancelled: inProgress.length,
        questionsDeleted: questions.length,
        suggestionsResolved: suggestions.length,
        topicId
      }),
      command: 'training.topic.delete',
      mode: 'session',
      ok: true,
      owner: email,
      severity: 'medium'
    })
    return {
      assignmentsCancelled: assignments.length,
      attemptsCancelled: inProgress.length,
      questionsDeleted: questions.length,
      suggestionsResolved: suggestions.length
    }
  }
})
const inferBatchSubstantive = query({
  args: { suggestionIds: v.array(v.id('testQuestionSuggestions')) },
  handler: async (ctx, { suggestionIds }): Promise<'cosmetic' | 'substantive'> => {
    const kinds = new Set<string>()
    for (const id of suggestionIds) {
      const row = await ctx.db.get(id)
      if (row) kinds.add(row.kind)
    }
    if (kinds.has('retire')) return 'substantive'
    return 'cosmetic'
  }
})
const retireEmptyTopics = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ retired: number; scanned: number }> => {
    const topics = await ctx.db
      .query('topics')
      .withIndex('by_deletedAt', q => q.eq('deletedAt', undefined))
      .take(2000)
    let retired = 0
    for (const t of topics) {
      const q1 = await ctx.db
        .query('testQuestions')
        .withIndex('by_topic_deletedAt', x => x.eq('topicId', t._id).eq('deletedAt', undefined))
        .take(1)
      if (q1[0]) continue
      const s1 = await ctx.db
        .query('testQuestionSuggestions')
        .withIndex('by_topic_status', x => x.eq('topicId', t._id).eq('status', 'pending'))
        .take(1)
      if (s1[0]) continue
      await ctx.db.patch(t._id, { deletedAt: Date.now() })
      retired += 1
    }
    return { retired, scanned: topics.length }
  }
})
const markTopicSubstantive = mutation({
  args: { topicId: v.id('topics') },
  handler: async (ctx, { topicId }): Promise<{ assignmentsCreated: number; passesRevoked: number }> => {
    const identity = await ctx.auth.getUserIdentity()
    const email = identity?.email?.toLowerCase()
    if (!email) throw new Error('not authenticated')
    const profileRows = await ctx.db
      .query('userProfiles')
      .withIndex('by_userId', q => q.eq('userId', email))
      .collect()
    const profile = profileRows[0]
    if (profile?.role !== 'admin') throw new Error('admin only')
    const now = Date.now()
    await ctx.db.patch(topicId, { lastSubstantiveUpdate: now })
    const stalePass = await ctx.db
      .query('testPasses')
      .withIndex('by_topic_kind_passedAt', q => q.eq('topicId', topicId).eq('kind', 'assigned'))
      .filter(q => q.lt(q.field('passedAt'), now))
      .take(2000)
    let passesRevoked = 0
    let assignmentsCreated = 0
    for (const p of stalePass) {
      await ctx.db.delete(p._id)
      passesRevoked += 1
      const existingAssignmentRows = await ctx.db
        .query('testAssignments')
        .withIndex('by_user_topic', q => q.eq('userId', p.userId).eq('topicId', topicId))
        .filter(q => q.eq(q.field('deletedAt'), undefined))
        .collect()
      if (!existingAssignmentRows[0]) {
        await ctx.db.insert('testAssignments', { createdAt: now, createdBy: email, topicId, userId: p.userId })
        assignmentsCreated += 1
      }
    }
    await ctx.db.insert('auditLogs', {
      args: JSON.stringify({ assignmentsCreated, passesRevoked, topicId }),
      command: 'training.assignment.rearm',
      mode: 'session',
      ok: true,
      owner: email,
      severity: 'medium'
    })
    return { assignmentsCreated, passesRevoked }
  }
})
export {
  adminDeleteTopic,
  adminEditQuestion,
  adminRetireQuestion,
  approveSuggestion,
  approveSuggestionPublic,
  assignEligibleNow,
  autoAssign,
  inferBatchSubstantive,
  insertAuto,
  isAdminByEmail,
  isAutoAssignEnabled,
  listAttemptsForAdmin,
  listEligibleTopics,
  listMyTopics,
  listPendingSuggestionsForAdmin,
  listRoleUsers,
  markTopicSubstantive,
  persistSuggestions,
  persistSuggestionsWithEmbedding,
  rejectSuggestionPublic,
  resolvePairAction,
  retireEmptyTopics,
  writeAuditRow
}
