import { v } from 'convex/values'
import { internalAction, internalMutation, internalQuery, query } from './_generated/server'
import { internal } from './_generated/api'
const AGENT_OWNER = 'agent'
const POOL_MIN = 5
const insertAuto = internalMutation({
  args: { topicId: v.id('topics'), userId: v.string() },
  handler: async (ctx, { topicId, userId }): Promise<{ inserted: boolean }> => {
    const existingPass = await ctx.db
      .query('testPasses')
      .withIndex('by_user_topic_kind', q => q.eq('userId', userId).eq('topicId', topicId).eq('kind', 'assigned'))
      .first()
    if (existingPass) return { inserted: false }
    const existingAssignment = await ctx.db
      .query('testAssignments')
      .withIndex('by_user_topic', q => q.eq('userId', userId).eq('topicId', topicId))
      .filter(q => q.eq(q.field('deletedAt'), undefined))
      .first()
    if (existingAssignment) return { inserted: false }
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
    const row = await ctx.db
      .query('settings')
      .withIndex('by_key', q => q.eq('key', 'agent_auto_assign_enabled'))
      .first()
    return row?.value === 'true'
  }
})
const writeAuditRow = internalMutation({
  args: { args: v.string(), command: v.string(), mode: v.string(), ok: v.boolean(), owner: v.string() },
  handler: async (ctx, row): Promise<void> => {
    await ctx.db.insert('auditLogs', row)
  }
})
const autoAssign = internalAction({
  args: {},
  handler: async (ctx): Promise<{ assignmentsCreated: number; topicsProcessed: number; durationMs: number }> => {
    const t0 = Date.now()
    const enabled = (await ctx.runQuery(internal.training.isAutoAssignEnabled, {})) as boolean
    if (!enabled) {
      await ctx.runMutation(internal.training.writeAuditRow, {
        args: JSON.stringify({ assignmentsCreated: 0, durationMs: Date.now() - t0, reason: 'flag-disabled', topicsProcessed: 0 }),
        command: 'training.cron.run',
        mode: 'system',
        ok: true,
        owner: AGENT_OWNER
      })
      return { assignmentsCreated: 0, durationMs: Date.now() - t0, topicsProcessed: 0 }
    }
    const topics = (await ctx.runQuery(internal.training.listEligibleTopics, {})) as { _id: string; poolSize: number }[]
    const users = (await ctx.runQuery(internal.training.listRoleUsers, {})) as { userId: string }[]
    let created = 0
    for (const t of topics)
      for (const u of users) {
        const r = (await ctx.runMutation(internal.training.insertAuto, {
          topicId: t._id as never,
          userId: u.userId
        })) as { inserted: boolean }
        if (r.inserted) created += 1
      }
    const durationMs = Date.now() - t0
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
    const out: { _id: string; myStatus: string; name: string; poolSize: number }[] = []
    for (const t of topics) {
      const pool = await ctx.db
        .query('testQuestions')
        .withIndex('by_topic_deletedAt', q => q.eq('topicId', t._id).eq('deletedAt', undefined))
        .take(POOL_MIN + 1)
      const pass = await ctx.db
        .query('testPasses')
        .withIndex('by_user_topic_kind', q => q.eq('userId', userId).eq('topicId', t._id).eq('kind', 'assigned'))
        .first()
      const selfPass = await ctx.db
        .query('testPasses')
        .withIndex('by_user_topic_kind', q => q.eq('userId', userId).eq('topicId', t._id).eq('kind', 'self'))
        .first()
      const myStatus = pass ? 'passed-assigned' : selfPass ? 'passed-self' : 'not-attempted'
      out.push({ _id: t._id, myStatus, name: t.name, poolSize: pool.length })
    }
    return out
  }
})
export { autoAssign, insertAuto, isAutoAssignEnabled, listEligibleTopics, listMyTopics, listRoleUsers, writeAuditRow }
