/* eslint-disable no-continue */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential Convex DB ops */
/** biome-ignore-all lint/nursery/noContinue: control flow shape */
/** biome-ignore-all lint/nursery/noShadow: scoped shadows ok */
/* eslint-disable no-await-in-loop */
import { v } from 'convex/values'
import type { QueryCtx } from './_generated/server'
import { query } from './_generated/server'

const BILLING_CYCLE_ANCHOR_DAY = 5
const TEST_OWNER_PATTERNS = ['@example.com', '@user.test', '@example.org', 'gdpr-admin@', 'perf-test', 'proxy-test']
const isTestOwner = (owner: string): boolean => {
  const lower = owner.toLowerCase()
  return TEST_OWNER_PATTERNS.some(p => lower.includes(p))
}
const has = (arr: string[] | undefined, v2: string): boolean => !arr || arr.length === 0 || arr.includes(v2)
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
const prevCycle = (startISO: string, anchorDay: number): { end: string; start: string } => {
  const [y, m] = startISO.split('-').map(Number)
  const cur = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, anchorDay))
  const start = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() - 1, anchorDay))
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, anchorDay - 1))
  return { end: fmtDate(end), start: fmtDate(start) }
}
const topStrip = query({
  args: {},
  handler: async (
    ctx
  ): Promise<null | {
    activeChats: number
    cycleCents: number
    cycleStart: string
    docsInCorpus: number
    pendingSuggestions: number
    policyPendingDocs: number
    quarantineDocs: number
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
    for (const r of costRows)
      if (r.dayKey >= cycle.start && r.dayKey <= cycle.end && !isTestOwner(r.owner)) cycleCents += r.cents
    const pendingSugs = await ctx.db
      .query('testQuestionSuggestions')
      .filter(q => q.eq(q.field('status'), 'pending'))
      .take(1000)
    const pendingSuggestions = pendingSugs.length
    const policyPendingRows = await ctx.db
      .query('docs')
      .withIndex('by_policyStatus', q => q.eq('policyStatus', 'pending'))
      .filter(q => q.eq(q.field('deletedAt'), undefined))
      .take(1000)
    const policyPendingDocs = policyPendingRows.length
    const allActiveDocs = await ctx.db
      .query('docs')
      .withIndex('by_deletedAt', q => q.eq('deletedAt', undefined))
      .take(5000)
    const quarantineDocs = allActiveDocs.filter(d => d.scanStatus === 'quarantined').length
    const activeChatRows = await ctx.db
      .query('chats')
      .withIndex('by_streaming_startedAt', q => q.eq('streaming', true))
      .take(1000)
    const activeChats = activeChatRows.filter(c => c.deletedAt === undefined).length
    return {
      activeChats,
      cycleCents,
      cycleStart: cycle.start,
      docsInCorpus,
      pendingSuggestions,
      policyPendingDocs,
      quarantineDocs,
      totalUsers
    }
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
    const todayCycle = cycleStartFor(now, BILLING_CYCLE_ANCHOR_DAY)
    const cycles: { end: string; start: string }[] = [todayCycle]
    for (let i = 1; i < n; i += 1) {
      const prev = cycles[i - 1]
      if (!prev) break
      cycles.push(prevCycle(prev.start, BILLING_CYCLE_ANCHOR_DAY))
    }
    const rows = await ctx.db.query('costRecords').take(10_000)
    return cycles.map(c => {
      let cents = 0
      for (const r of rows) if (r.dayKey >= c.start && r.dayKey <= c.end && !isTestOwner(r.owner)) cents += r.cents
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
      if (isTestOwner(r.owner)) continue
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
const DEFAULT_DUE_DAYS = 14
const DAY_MS = 86_400_000
const getDueDays = async (ctx: QueryCtx): Promise<number> => {
  // biome-ignore lint/nursery/noPlaywrightUselessAwait: Convex .first() returns thenable
  const row = await ctx.db
    .query('settings')
    .withIndex('by_key', q => q.eq('key', 'assignment_due_days'))
    .first()
  const n = row ? Number.parseInt(row.value, 10) : Number.NaN
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DUE_DAYS
}
interface TopicTrain {
  assigned: number
  name: string
  overdue: number
  passed: number
  poolSize: number
  topicId: string
}
interface UserTestDetail {
  name: string
  overdueDays: number
  status: 'open' | 'overdue' | 'passed'
}
interface UserTrain {
  assigned: number
  department?: string
  details: UserTestDetail[]
  overdue: number
  passed: number
  userId: string
}
const computeTrain = async (ctx: QueryCtx): Promise<{ now: number; topics: TopicTrain[]; users: UserTrain[] }> => {
  const now = Date.now()
  const dueMs = (await getDueDays(ctx)) * DAY_MS
  const userRows = await ctx.db
    .query('userProfiles')
    .withIndex('by_role', q => q.eq('role', 'user'))
    .take(2000)
  const topicRowsAll = await ctx.db
    .query('topics')
    .withIndex('by_deletedAt', q => q.eq('deletedAt', undefined))
    .take(500)
  const topicRows = topicRowsAll.toSorted((a, b) => a.createdAt - b.createdAt)
  const topicsWithPool: { _id: string; name: string; poolSize: number }[] = []
  for (const t of topicRows) {
    const pool = await ctx.db
      .query('testQuestions')
      .withIndex('by_topic_deletedAt', q => q.eq('topicId', t._id).eq('deletedAt', undefined))
      .take(200)
    if (pool.length >= 5) topicsWithPool.push({ _id: t._id, name: t.name, poolSize: pool.length })
  }
  const users: UserTrain[] = userRows.map(u => ({
    assigned: 0,
    department: u.department,
    details: [],
    overdue: 0,
    passed: 0,
    userId: u.userId
  }))
  const topics: TopicTrain[] = topicsWithPool.map(t => ({
    assigned: 0,
    name: t.name,
    overdue: 0,
    passed: 0,
    poolSize: t.poolSize,
    topicId: t._id
  }))
  for (const u of users)
    for (const t of topics) {
      const passRows = await ctx.db
        .query('testPasses')
        .withIndex('by_user_topic_kind', q =>
          q
            .eq('userId', u.userId)
            .eq('topicId', t.topicId as never)
            .eq('kind', 'assigned')
        )
        .collect()
      const assignmentRows = await ctx.db
        .query('testAssignments')
        .withIndex('by_user_topic', q => q.eq('userId', u.userId).eq('topicId', t.topicId as never))
        .filter(q => q.eq(q.field('deletedAt'), undefined))
        .collect()
      if (assignmentRows.length === 0) continue
      u.assigned += 1
      t.assigned += 1
      if (passRows[0]) {
        u.passed += 1
        t.passed += 1
        u.details.push({ name: t.name, overdueDays: 0, status: 'passed' })
        continue
      }
      const effectiveDue = Math.min(...assignmentRows.map(r => r.dueAtMs ?? r.createdAt + dueMs))
      if (now > effectiveDue) {
        u.overdue += 1
        t.overdue += 1
        u.details.push({
          name: t.name,
          overdueDays: Math.max(1, Math.ceil((now - effectiveDue) / DAY_MS)),
          status: 'overdue'
        })
      } else u.details.push({ name: t.name, overdueDays: 0, status: 'open' })
    }
  return { now, topics, users }
}
const trainingSummary = query({
  args: {},
  handler: async (
    ctx
  ): Promise<null | {
    atRiskCount: number
    overallPassRate: number
    tests: TopicTrain[]
    totalUsers: number
    usersFullyCompliantPct: number
    weakestTest: null | { name: string; passRate: number; topicId: string }
  }> => {
    const adminEmail = await requireAdmin(ctx)
    if (!adminEmail) return null
    const { topics, users } = await computeTrain(ctx)
    const totalUsers = users.length
    const withAssignments = users.filter(u => u.assigned > 0)
    const compliant = withAssignments.filter(u => u.passed === u.assigned).length
    const usersFullyCompliantPct =
      withAssignments.length === 0 ? 0 : Math.round((compliant / withAssignments.length) * 100)
    const sumAssigned = topics.reduce((s, t) => s + t.assigned, 0)
    const sumPassed = topics.reduce((s, t) => s + t.passed, 0)
    const overallPassRate = sumAssigned === 0 ? 0 : Math.round((sumPassed / sumAssigned) * 100)
    const atRiskCount = users.filter(u => u.assigned - u.passed > 0).length
    const assignedTopics = topics.filter(t => t.assigned > 0)
    const weakest = assignedTopics.toSorted(
      (a, b) => a.passed / a.assigned - b.passed / b.assigned || b.assigned - a.assigned
    )[0]
    const weakestTest = weakest
      ? { name: weakest.name, passRate: Math.round((weakest.passed / weakest.assigned) * 100), topicId: weakest.topicId }
      : null
    return {
      atRiskCount,
      overallPassRate,
      tests: topics,
      totalUsers,
      usersFullyCompliantPct,
      weakestTest
    }
  }
})
const VN_TZ_MS = 7 * 60 * 60 * 1000
const vnDate = (ms: number): string => fmtDate(new Date(ms + VN_TZ_MS))
const STATUS_LABEL = { open: 'Not passed', overdue: 'Overdue', passed: 'Passed' } as const
interface AssignRow {
  assigned: string
  at: number
  deadline: string
  department: string
  overdueDays: number
  source: 'admin' | 'agent'
  status: 'open' | 'overdue' | 'passed'
  test: string
  userId: string
}
const uniqSorted = (xs: string[]): string[] => [...new Set(xs)].toSorted((a, b) => a.localeCompare(b))
const assignmentsTable = query({
  args: {
    assigneds: v.optional(v.array(v.string())),
    deadlines: v.optional(v.array(v.string())),
    departments: v.optional(v.array(v.string())),
    page: v.optional(v.number()),
    statuses: v.optional(v.array(v.string())),
    tests: v.optional(v.array(v.string()))
  },
  handler: async (
    ctx,
    { page, departments, tests, statuses, deadlines, assigneds }
  ): Promise<null | {
    facets: { assigneds: string[]; deadlines: string[]; departments: string[]; statuses: string[]; tests: string[] }
    latest: AssignRow | null
    pageCount: number
    rows: AssignRow[]
    total: number
  }> => {
    const adminEmail = await requireAdmin(ctx)
    if (!adminEmail) return null
    const now = Date.now()
    const dueMs = (await getDueDays(ctx)) * DAY_MS
    const profiles = await ctx.db
      .query('userProfiles')
      .withIndex('by_role', q => q.eq('role', 'user'))
      .take(5000)
    const deptOf = new Map(profiles.map(p => [p.userId, p.department ?? '—']))
    const live = await ctx.db
      .query('testAssignments')
      .order('desc')
      .filter(q => q.eq(q.field('deletedAt'), undefined))
      .take(5000)
    const topicNames = new Map<string, string>()
    const all: AssignRow[] = []
    for (const a of live) {
      if (!deptOf.has(a.userId)) continue
      let name = topicNames.get(a.topicId)
      if (name === undefined) {
        const t = await ctx.db.get(a.topicId)
        name = t?.name ?? '(deleted test)'
        topicNames.set(a.topicId, name)
      }
      const passed = await ctx.db
        .query('testPasses')
        .withIndex('by_user_topic_kind', q => q.eq('userId', a.userId).eq('topicId', a.topicId).eq('kind', 'assigned'))
        .collect()
      const dueAt = a.dueAtMs ?? a.createdAt + dueMs
      let st: AssignRow['status'] = 'open'
      let overdueDays = 0
      if (passed[0]) st = 'passed'
      else if (now > dueAt) {
        st = 'overdue'
        overdueDays = Math.max(1, Math.ceil((now - dueAt) / DAY_MS))
      }
      all.push({
        assigned: vnDate(a.createdAt),
        at: a.createdAt,
        deadline: vnDate(dueAt),
        department: deptOf.get(a.userId) ?? '—',
        overdueDays,
        source: a.createdBy === 'agent' ? 'agent' : 'admin',
        status: st,
        test: name,
        userId: a.userId
      })
    }
    const latest = all[0] ?? null
    const facets = {
      assigneds: uniqSorted(all.map(r => r.assigned)),
      deadlines: uniqSorted(all.map(r => r.deadline)),
      departments: uniqSorted(all.map(r => r.department)),
      statuses: uniqSorted(all.map(r => STATUS_LABEL[r.status])),
      tests: uniqSorted(all.map(r => r.test))
    }
    const filtered = all.filter(
      r =>
        has(departments, r.department) &&
        has(tests, r.test) &&
        has(statuses, STATUS_LABEL[r.status]) &&
        has(deadlines, r.deadline) &&
        has(assigneds, r.assigned)
    )
    const rank = { open: 1, overdue: 0, passed: 2 }
    const sorted = filtered.toSorted((a, b) => rank[a.status] - rank[b.status] || b.at - a.at)
    const pageSize = 10
    const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
    const p = Math.min(Math.max(0, page ?? 0), pageCount - 1)
    return {
      facets,
      latest,
      pageCount,
      rows: sorted.slice(p * pageSize, p * pageSize + pageSize),
      total: sorted.length
    }
  }
})
interface UserSummaryRow {
  assigned: number
  department: string
  overdue: number
  passed: number
  userId: string
}
const userSummary = query({
  args: { page: v.optional(v.number()), search: v.optional(v.string()) },
  handler: async (ctx, { page, search }): Promise<null | { pageCount: number; rows: UserSummaryRow[]; total: number }> => {
    const adminEmail = await requireAdmin(ctx)
    if (!adminEmail) return null
    const { users } = await computeTrain(ctx)
    const term = (search ?? '').trim().toLowerCase()
    const filtered = (term ? users.filter(u => u.userId.toLowerCase().includes(term)) : users).map(u => ({
      assigned: u.assigned,
      department: u.department ?? '—',
      overdue: u.overdue,
      passed: u.passed,
      userId: u.userId
    }))
    const sorted = filtered.toSorted(
      (a, b) =>
        b.overdue - a.overdue || b.assigned - b.passed - (a.assigned - a.passed) || a.userId.localeCompare(b.userId)
    )
    const pageSize = 25
    const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
    const p = Math.min(Math.max(0, page ?? 0), pageCount - 1)
    return { pageCount, rows: sorted.slice(p * pageSize, p * pageSize + pageSize), total: sorted.length }
  }
})
export { assignmentsTable, costCycleHistory, costCyclePivot, topStrip, trainingSummary, userSummary }
