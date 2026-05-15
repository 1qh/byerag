/* eslint-disable no-continue */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential Convex DB ops */
/** biome-ignore-all lint/nursery/noContinue: control flow shape */
/** biome-ignore-all lint/nursery/noShadow: scoped shadows ok */
/* oxlint-disable eslint(no-await-in-loop), eslint(complexity), eslint(no-shadow), eslint(no-unused-vars), eslint(no-sequences), unicorn(no-array-reduce), unicorn(prefer-ternary), eslint(max-params) */
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
const fmtDate = (x: Date): string =>
  `${x.getUTCFullYear()}-${(x.getUTCMonth() + 1).toString().padStart(2, '0')}-${x.getUTCDate().toString().padStart(2, '0')}`
const cycleStartFor = (now: number, anchorDay: number): { end: string; start: string } => {
  const d = new Date(now)
  const day = d.getUTCDate()
  const cycleStart =
    day >= anchorDay
      ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), anchorDay))
      : new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, anchorDay))
  const cycleEnd = new Date(Date.UTC(cycleStart.getUTCFullYear(), cycleStart.getUTCMonth() + 1, anchorDay - 1))
  return { end: fmtDate(cycleEnd), start: fmtDate(cycleStart) }
}
const topStrip = query({
  args: {},
  handler: async (
    ctx
  ): Promise<null | {
    cycleCents: number
    cycleStart: string
    docsInCorpus: number
    totalUsers: number
  }> => {
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
      .filter(q =>
        q.and(
          q.eq(q.field('deletedAt'), undefined),
          q.eq(q.field('policyStatus'), 'approved'),
          q.eq(q.field('scanStatus'), 'clean')
        )
      )
      .take(5000)
    const docsInCorpus = docs.length
    const cycle = cycleStartFor(Date.now(), BILLING_CYCLE_ANCHOR_DAY)
    const costRows = await ctx.db.query('costRecords').take(5000)
    let cycleCents = 0
    for (const r of costRows) if (r.dayKey >= cycle.start && r.dayKey <= cycle.end) cycleCents += r.cents
    return { cycleCents, cycleStart: cycle.start, docsInCorpus, totalUsers }
  }
})
const costCycleHistory = query({
  args: { count: v.optional(v.number()) },
  handler: async (
    ctx,
    { count }
  ): Promise<{ cents: number; cycleEnd: string; cycleStart: string; isCurrent: boolean }[]> => {
    const adminEmail = await requireAdmin(ctx)
    if (!adminEmail) return []
    const n = Math.min(count ?? 6, 24)
    const now = Date.now()
    const cycles: { end: string; start: string }[] = []
    for (let i = 0; i < n; i += 1) cycles.push(cycleStartFor(now - 30 * 86_400_000 * i, BILLING_CYCLE_ANCHOR_DAY))
    const rows = await ctx.db.query('costRecords').take(10_000)
    const todayCycle = cycleStartFor(now, BILLING_CYCLE_ANCHOR_DAY)
    return cycles.map(c => {
      let cents = 0
      for (const r of rows) if (r.dayKey >= c.start && r.dayKey <= c.end) cents += r.cents
      return { cents, cycleEnd: c.end, cycleStart: c.start, isCurrent: c.start === todayCycle.start }
    })
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
      ? {
          end: cycleStartFor(Date.parse(`${cycleStart}T00:00:00Z`) + 86_400_000 * 31, BILLING_CYCLE_ANCHOR_DAY).end,
          start: cycleStart
        }
      : cycleStartFor(Date.now(), BILLING_CYCLE_ANCHOR_DAY)
    const rows = await ctx.db.query('costRecords').take(10_000)
    const agg = new Map<
      string,
      { cents: number; inputTokens: number; model: string; outputTokens: number; owner: string }
    >()
    for (const r of rows) {
      if (r.dayKey < cycle.start || r.dayKey > cycle.end) continue
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
const gradebook = query({
  args: {},
  handler: async (
    ctx
  ): Promise<{
    cells: { glyph: '·' | '✓' | '✗' | 'ⓐ'; topicId: string; userId: string }[]
    colFooters: { assigned: number; passedAssigned: number; topicId: string }[]
    rowTotals: { assignedCount: number; passedCount: number; userId: string }[]
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
    const topicRowsAll = await ctx.db
      .query('topics')
      .withIndex('by_deletedAt', q => q.eq('deletedAt', undefined))
      .take(500)
    const topicRows = topicRowsAll.toSorted((a, b) => a.createdAt - b.createdAt)
    const topicsWithPool: { _id: string; name: string }[] = []
    for (const t of topicRows) {
      const pool = await ctx.db
        .query('testQuestions')
        .withIndex('by_topic_deletedAt', q => q.eq('topicId', t._id).eq('deletedAt', undefined))
        .take(6)
      if (pool.length >= 5) topicsWithPool.push({ _id: t._id, name: t.name })
    }
    const cells: { glyph: '·' | '✓' | '✗' | 'ⓐ'; topicId: string; userId: string }[] = []
    for (const u of users)
      for (const t of topicsWithPool) {
        const passRows = await ctx.db
          .query('testPasses')
          .withIndex('by_user_topic_kind', q =>
            q
              .eq('userId', u.userId)
              .eq('topicId', t._id as never)
              .eq('kind', 'assigned')
          )
          .collect()
        const selfPassRows = await ctx.db
          .query('testPasses')
          .withIndex('by_user_topic_kind', q =>
            q
              .eq('userId', u.userId)
              .eq('topicId', t._id as never)
              .eq('kind', 'self')
          )
          .collect()
        if (passRows[0] || selfPassRows[0]) {
          cells.push({ glyph: '✓', topicId: t._id, userId: u.userId })
          continue
        }
        const assignmentRows = await ctx.db
          .query('testAssignments')
          .withIndex('by_user_topic', q => q.eq('userId', u.userId).eq('topicId', t._id as never))
          .filter(q => q.eq(q.field('deletedAt'), undefined))
          .collect()
        if (assignmentRows.length === 0) {
          cells.push({ glyph: '·', topicId: t._id, userId: u.userId })
          continue
        }
        const adminRow = assignmentRows.find(r => r.createdBy !== 'agent')
        cells.push({ glyph: adminRow ? '✗' : 'ⓐ', topicId: t._id, userId: u.userId })
      }
    const rowTotals = users.map(u => {
      const myCells = cells.filter(c => c.userId === u.userId)
      const assignedCount = myCells.filter(c => c.glyph !== '·').length
      const passedCount = myCells.filter(c => c.glyph === '✓').length
      return { assignedCount, passedCount, userId: u.userId }
    })
    const colFooters = topicsWithPool.map(t => {
      const colCells = cells.filter(c => c.topicId === t._id)
      const assigned = colCells.filter(c => c.glyph !== '·').length
      const passedAssigned = colCells.filter(c => c.glyph === '✓').length
      return { assigned, passedAssigned, topicId: t._id }
    })
    const usersSorted = users.toSorted((a, b) => {
      const ra = rowTotals.find(r => r.userId === a.userId)
      const rb = rowTotals.find(r => r.userId === b.userId)
      const ta = ra && ra.assignedCount > 0 ? ra.passedCount / ra.assignedCount : 0
      const tb = rb && rb.assignedCount > 0 ? rb.passedCount / rb.assignedCount : 0
      return ta - tb
    })
    return { cells, colFooters, rowTotals, topics: topicsWithPool, users: usersSorted }
  }
})
export { costCycleHistory, costCyclePivot, gradebook, topStrip }
