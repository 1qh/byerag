/** biome-ignore-all lint/performance/noAwaitInLoops: sequential Convex DB ops */
/* eslint-disable no-await-in-loop */
import { v } from 'convex/values'
import type { QueryCtx } from './_generated/server'
import { query } from './_generated/server'
const BILLING_CYCLE_ANCHOR_DAY = 5
const requireAdmin = async (ctx: QueryCtx): Promise<null | string> => {
  const identity = await ctx.auth.getUserIdentity()
  const email = identity?.email?.toLowerCase()
  if (!email) return null
  // biome-ignore lint/nursery/noPlaywrightUselessAwait: Convex .first() returns thenable
  const profile = await ctx.db
    .query('userProfiles')
    .withIndex('by_userId', q => q.eq('userId', email))
    .first()
  return profile?.role === 'admin' ? email : null
}
const cycleStartFor = (now: number, anchorDay: number): { end: string; start: string } => {
  const d = new Date(now)
  const day = d.getUTCDate()
  const cycleStart =
    day >= anchorDay
      ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), anchorDay))
      : new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, anchorDay))
  const cycleEnd = new Date(Date.UTC(cycleStart.getUTCFullYear(), cycleStart.getUTCMonth() + 1, anchorDay - 1))
  const fmt = (x: Date): string =>
    `${x.getUTCFullYear()}-${(x.getUTCMonth() + 1).toString().padStart(2, '0')}-${x.getUTCDate().toString().padStart(2, '0')}`
  return { end: fmt(cycleEnd), start: fmt(cycleStart) }
}
const topStrip = query({
  args: {},
  handler: async (
    ctx
  ): Promise<{
    cycleCents: number
    cycleStart: string
    docsInCorpus: number
    totalUsers: number
  } | null> => {
    const adminEmail = await requireAdmin(ctx)
    if (!adminEmail) return null
    const usersRows = await ctx.db
      .query('userProfiles')
      .withIndex('by_role', q => q.eq('role', 'user'))
      .take(2000)
    const totalUsers = usersRows.length
    const docs = await ctx.db
      .query('docs')
      .withIndex('by_scope_uploadedAt', q => q.eq('scope', 'shared'))
      .filter(q => q.and(q.eq(q.field('deletedAt'), undefined), q.eq(q.field('policyStatus'), 'approved'), q.eq(q.field('scanStatus'), 'clean')))
      .take(5000)
    const docsInCorpus = docs.length
    const cycle = cycleStartFor(Date.now(), BILLING_CYCLE_ANCHOR_DAY)
    const costRows = await ctx.db.query('costRecords').take(5000)
    let cycleCents = 0
    for (const r of costRows) if (r.dayKey >= cycle.start && r.dayKey <= cycle.end) cycleCents += r.cents
    return { cycleCents, cycleStart: cycle.start, docsInCorpus, totalUsers }
  }
})
const costCyclePivot = query({
  args: { cycleStart: v.optional(v.string()) },
  handler: async (
    ctx,
    { cycleStart }
  ): Promise<{ cents: number; inputTokens: number; model: string; outputTokens: number; owner: string }[]> => {
    const adminEmail = await requireAdmin(ctx)
    if (!adminEmail) return []
    const cycle = cycleStart
      ? { end: cycleStartFor(Date.parse(`${cycleStart}T00:00:00Z`) + 86_400_000 * 31, BILLING_CYCLE_ANCHOR_DAY).end, start: cycleStart }
      : cycleStartFor(Date.now(), BILLING_CYCLE_ANCHOR_DAY)
    const rows = await ctx.db.query('costRecords').take(10_000)
    const agg = new Map<string, { cents: number; inputTokens: number; model: string; outputTokens: number; owner: string }>()
    for (const r of rows) {
      if (r.dayKey < cycle.start || r.dayKey > cycle.end) continue
      const key = `${r.owner}|${r.model}`
      const e = agg.get(key)
      if (e) {
        e.cents += r.cents
        e.inputTokens += r.inputTokens
        e.outputTokens += r.outputTokens
      } else agg.set(key, { cents: r.cents, inputTokens: r.inputTokens, model: r.model, outputTokens: r.outputTokens, owner: r.owner })
    }
    return [...agg.values()].sort((a, b) => b.cents - a.cents)
  }
})
const gradebook = query({
  args: {},
  handler: async (
    ctx
  ): Promise<{
    cells: { glyph: '✓' | '✗' | 'ⓐ' | '·'; topicId: string; userId: string }[]
    topics: { _id: string; name: string }[]
    users: { department?: string; userId: string }[]
  } | null> => {
    const adminEmail = await requireAdmin(ctx)
    if (!adminEmail) return null
    const userRows = await ctx.db
      .query('userProfiles')
      .withIndex('by_role', q => q.eq('role', 'user'))
      .take(2000)
    const users = userRows.map(u => ({ department: u.department, userId: u.userId }))
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
    const cells: { glyph: '✓' | '✗' | 'ⓐ' | '·'; topicId: string; userId: string }[] = []
    for (const u of users)
      for (const t of topicsWithPool) {
        const pass = await ctx.db
          .query('testPasses')
          .withIndex('by_user_topic_kind', q => q.eq('userId', u.userId).eq('topicId', t._id as never).eq('kind', 'assigned'))
          .first()
        const selfPass = await ctx.db
          .query('testPasses')
          .withIndex('by_user_topic_kind', q => q.eq('userId', u.userId).eq('topicId', t._id as never).eq('kind', 'self'))
          .first()
        if (pass || selfPass) {
          cells.push({ glyph: '✓', topicId: t._id, userId: u.userId })
          continue
        }
        const assignment = await ctx.db
          .query('testAssignments')
          .withIndex('by_user_topic', q => q.eq('userId', u.userId).eq('topicId', t._id as never))
          .filter(q => q.eq(q.field('deletedAt'), undefined))
          .first()
        if (!assignment) {
          cells.push({ glyph: '·', topicId: t._id, userId: u.userId })
          continue
        }
        cells.push({ glyph: assignment.createdBy === 'agent' ? 'ⓐ' : '✗', topicId: t._id, userId: u.userId })
      }
    return { cells, topics: topicsWithPool, users }
  }
})
export { costCyclePivot, gradebook, topStrip }
