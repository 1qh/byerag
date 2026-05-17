/* eslint-disable no-await-in-loop, no-continue */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential Convex DB ops */
/** biome-ignore-all lint/nursery/noContinue: control flow shape */
/** biome-ignore-all lint/nursery/noShadow: scoped shadows ok */
/* oxlint-disable eslint(no-await-in-loop), eslint(complexity), eslint(no-shadow), eslint(no-unused-vars), eslint(no-sequences), unicorn(no-array-reduce), unicorn(prefer-ternary), eslint(max-params) */
import { v } from 'convex/values'
import type { MutationCtx } from './_generated/server'
import { mutation, query } from './_generated/server'
const POOL_MIN = 5
const requireAdminEmail = async (ctx: MutationCtx): Promise<string> => {
  const identity = await ctx.auth.getUserIdentity()
  const email = identity?.email?.toLowerCase()
  if (!email) throw new Error('not authenticated')
  // biome-ignore lint/nursery/noPlaywrightUselessAwait: Convex .first() returns thenable
  const profile = await ctx.db
    .query('userProfiles')
    .withIndex('by_userId', q => q.eq('userId', email))
    .first()
  if (profile?.role !== 'admin') throw new Error('admin only')
  return email
}
const assignAllForTopic = mutation({
  args: { topicId: v.id('topics') },
  handler: async (ctx, { topicId }): Promise<{ assignmentsCreated: number }> => {
    const adminEmail = await requireAdminEmail(ctx)
    const pool = await ctx.db
      .query('testQuestions')
      .withIndex('by_topic_deletedAt', q => q.eq('topicId', topicId).eq('deletedAt', undefined))
      .take(POOL_MIN + 1)
    if (pool.length < POOL_MIN) throw new Error(`pool too small: ${pool.length}/${POOL_MIN}`)
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
      const existingRows = await ctx.db
        .query('testAssignments')
        .withIndex('by_user_topic', q => q.eq('userId', u.userId).eq('topicId', topicId))
        .filter(q => q.eq(q.field('deletedAt'), undefined))
        .collect()
      if (existingRows[0]) continue
      await ctx.db.insert('testAssignments', { createdAt: Date.now(), createdBy: adminEmail, topicId, userId: u.userId })
      created += 1
    }
    await ctx.db.insert('auditLogs', {
      args: JSON.stringify({ assignmentsCreated: created, topicId, users: users.length }),
      command: 'training.assignment.assignAll',
      mode: 'session',
      ok: true,
      owner: adminEmail,
      severity: 'medium'
    })
    return { assignmentsCreated: created }
  }
})
const assignUsersForTopic = mutation({
  args: { topicId: v.id('topics'), userIds: v.array(v.string()) },
  handler: async (ctx, { topicId, userIds }): Promise<{ assignmentsCreated: number; skipped: number }> => {
    const adminEmail = await requireAdminEmail(ctx)
    const pool = await ctx.db
      .query('testQuestions')
      .withIndex('by_topic_deletedAt', q => q.eq('topicId', topicId).eq('deletedAt', undefined))
      .take(POOL_MIN + 1)
    if (pool.length < POOL_MIN) throw new Error(`pool too small: ${pool.length}/${POOL_MIN}`)
    let created = 0
    let skipped = 0
    for (const userId of userIds) {
      const profileRows = await ctx.db
        .query('userProfiles')
        .withIndex('by_userId', q => q.eq('userId', userId))
        .collect()
      if (profileRows[0]?.role !== 'user') {
        skipped += 1
        continue
      }
      const passRows = await ctx.db
        .query('testPasses')
        .withIndex('by_user_topic_kind', q => q.eq('userId', userId).eq('topicId', topicId).eq('kind', 'assigned'))
        .collect()
      if (passRows[0]) {
        skipped += 1
        continue
      }
      const existingRows = await ctx.db
        .query('testAssignments')
        .withIndex('by_user_topic', q => q.eq('userId', userId).eq('topicId', topicId))
        .filter(q => q.eq(q.field('deletedAt'), undefined))
        .collect()
      if (existingRows[0]) {
        skipped += 1
        continue
      }
      await ctx.db.insert('testAssignments', { createdAt: Date.now(), createdBy: adminEmail, topicId, userId })
      created += 1
    }
    await ctx.db.insert('auditLogs', {
      args: JSON.stringify({ assignmentsCreated: created, requested: userIds.length, skipped, topicId }),
      command: 'training.assignment.assignUsers',
      mode: 'session',
      ok: true,
      owner: adminEmail,
      severity: 'medium'
    })
    return { assignmentsCreated: created, skipped }
  }
})
const unassignAllForTopic = mutation({
  args: { topicId: v.id('topics') },
  handler: async (ctx, { topicId }): Promise<{ assignmentsCancelled: number }> => {
    const adminEmail = await requireAdminEmail(ctx)
    const rows = await ctx.db
      .query('testAssignments')
      .withIndex('by_topic_deletedAt', q => q.eq('topicId', topicId).eq('deletedAt', undefined))
      .take(2000)
    const now = Date.now()
    let cancelled = 0
    for (const r of rows) {
      await ctx.db.patch(r._id, { deletedAt: now, deletedBy: adminEmail })
      const liveRows = await ctx.db
        .query('testAttempts')
        .withIndex('by_user_topic', q => q.eq('userId', r.userId).eq('topicId', topicId))
        .filter(q => q.eq(q.field('status'), 'in-progress'))
        .collect()
      const liveAttempt = liveRows[0]
      if (liveAttempt)
        await ctx.db.patch(liveAttempt._id, { cancelledReason: 'assignment-cancelled', status: 'cancelled' })
      cancelled += 1
    }
    await ctx.db.insert('auditLogs', {
      args: JSON.stringify({ assignmentsCancelled: cancelled, topicId }),
      command: 'training.assignment.unassignAll',
      mode: 'session',
      ok: true,
      owner: adminEmail,
      severity: 'medium'
    })
    return { assignmentsCancelled: cancelled }
  }
})
const myActiveAssignments = query({
  args: {},
  handler: async (ctx): Promise<{ _id: string; topicId: string }[]> => {
    const identity = await ctx.auth.getUserIdentity()
    const userId = identity?.email?.toLowerCase()
    if (!userId) return []
    const rows = await ctx.db
      .query('testAssignments')
      .withIndex('by_user_deletedAt', q => q.eq('userId', userId).eq('deletedAt', undefined))
      .take(500)
    return rows.map(r => ({ _id: r._id, topicId: r.topicId }))
  }
})
export { assignAllForTopic, assignUsersForTopic, myActiveAssignments, unassignAllForTopic }
