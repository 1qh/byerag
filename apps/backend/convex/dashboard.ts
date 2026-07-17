/** biome-ignore-all lint/suspicious/noShadow: scoped shadows ok */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential Convex DB ops */
/* eslint-disable no-await-in-loop */
import { v } from 'convex/values'
import type { Id } from './_generated/dataModel'
import type { QueryCtx } from './_generated/server'
import { query } from './_generated/server'
import { filterRealProfiles, isRealProfile } from './lib/userKind'

const BILLING_CYCLE_ANCHOR_DAY = 5
const SYNTHETIC_NON_USER_OWNERS = ['system']
const ORPHAN_TEST_OWNER_PATTERNS = [
  '@example.com',
  '@user.test',
  '@example.org',
  '@test.com',
  'gdpr-admin@',
  'perf-test',
  'proxy-test',
  'u1@',
  'u2@'
]
const matchesOrphanTestPattern = (owner: string): boolean => {
  const lower = owner.toLowerCase()
  return ORPHAN_TEST_OWNER_PATTERNS.some(p => lower.includes(p))
}
const testOwnersSet = async (ctx: QueryCtx): Promise<Set<string>> => {
  const profiles = await ctx.db.query('userProfiles').take(10_000)
  const out = new Set<string>(SYNTHETIC_NON_USER_OWNERS)
  const realByEmail = new Set(profiles.filter(p => p.kind !== 'test').map(p => p.userId.toLowerCase()))
  for (const p of profiles) if (p.kind === 'test') out.add(p.userId.toLowerCase())
  const costRows = await ctx.db.query('costRecords').take(10_000)
  for (const r of costRows) {
    const owner = r.owner.toLowerCase()
    if (!(out.has(owner) || realByEmail.has(owner)) && matchesOrphanTestPattern(owner)) out.add(owner)
  }
  return out
}
const isTestOwner = (owner: string, testOwners: Set<string>): boolean => testOwners.has(owner.toLowerCase())
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
    const usersRows = filterRealProfiles(
      await ctx.db
        .query('userProfiles')
        .withIndex('by_role', q => q.eq('role', 'user'))
        .take(2000)
    )
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
    const [costRows, testOwners] = await Promise.all([ctx.db.query('costRecords').take(5000), testOwnersSet(ctx)])
    let cycleCents = 0
    for (const r of costRows)
      if (r.dayKey >= cycle.start && r.dayKey <= cycle.end && !isTestOwner(r.owner, testOwners)) cycleCents += r.cents
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
    const [rows, testOwners] = await Promise.all([ctx.db.query('costRecords').take(10_000), testOwnersSet(ctx)])
    return cycles.map(c => {
      let cents = 0
      for (const r of rows)
        if (r.dayKey >= c.start && r.dayKey <= c.end && !isTestOwner(r.owner, testOwners)) cents += r.cents
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
    const [rows, testOwners] = await Promise.all([ctx.db.query('costRecords').take(10_000), testOwnersSet(ctx)])
    const agg = new Map<
      string,
      { cents: number; inputTokens: number; model: string; outputTokens: number; owner: string }
    >()
    for (const r of rows)
      if (r.dayKey >= cycle.start && r.dayKey <= cycle.end && !isTestOwner(r.owner, testOwners)) {
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
  const n = row ? Math.trunc(Number(row.value)) : Number.NaN
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
  failedAttempts: number
  overdue: number
  passed: number
  userId: string
}
const COACHING_THRESHOLD = 3
const cellKey = (userId: string, topicId: string): string => `${userId}|${topicId}`
interface CellCtx {
  assignedPassByCell: Set<string>
  assignmentsByCell: Map<string, { createdAt: number; dueAtMs?: number }[]>
  dueMs: number
  now: number
}
const tallyCell = (u: UserTrain, t: TopicTrain, c: CellCtx): void => {
  const k = cellKey(u.userId, t.topicId)
  const assignmentRows = c.assignmentsByCell.get(k)
  if (!assignmentRows || assignmentRows.length === 0) return
  u.assigned += 1
  t.assigned += 1
  if (c.assignedPassByCell.has(k)) {
    u.passed += 1
    t.passed += 1
    u.details.push({ name: t.name, overdueDays: 0, status: 'passed' })
    return
  }
  const effectiveDue = Math.min(...assignmentRows.map(r => r.dueAtMs ?? r.createdAt + c.dueMs))
  if (c.now > effectiveDue) {
    u.overdue += 1
    t.overdue += 1
    u.details.push({
      name: t.name,
      overdueDays: Math.max(1, Math.ceil((c.now - effectiveDue) / DAY_MS)),
      status: 'overdue'
    })
  } else u.details.push({ name: t.name, overdueDays: 0, status: 'open' })
}
// eslint-disable-next-line sonarjs/cognitive-complexity -- irreducible aggregation orchestrator: per-topic/per-user training-status accumulation
const computeTrain = async (ctx: QueryCtx): Promise<{ now: number; topics: TopicTrain[]; users: UserTrain[] }> => {
  const now = Date.now()
  const dueMs = (await getDueDays(ctx)) * DAY_MS
  const cycleStartMs = now - 30 * DAY_MS
  const [userRows, topicRowsAll, allAssignments, allPasses, allQuestions, allFailedAttempts] = await Promise.all([
    ctx.db
      .query('userProfiles')
      .withIndex('by_role', q => q.eq('role', 'user'))
      .take(2000),
    ctx.db
      .query('topics')
      .withIndex('by_deletedAt', q => q.eq('deletedAt', undefined))
      .take(500),
    ctx.db
      .query('testAssignments')
      .filter(q => q.eq(q.field('deletedAt'), undefined))
      .take(10_000),
    ctx.db.query('testPasses').take(10_000),
    ctx.db
      .query('testQuestions')
      .withIndex('by_deletedAt', q => q.eq('deletedAt', undefined))
      .take(5000),
    ctx.db
      .query('testAttempts')
      .withIndex('by_status_startedAt', q => q.eq('status', 'failed'))
      .take(5000)
  ])
  const poolByTopic = new Map<string, number>()
  for (const q of allQuestions) poolByTopic.set(q.topicId, (poolByTopic.get(q.topicId) ?? 0) + 1)
  const topicRows = topicRowsAll.toSorted((a, b) => a.createdAt - b.createdAt)
  const topicsWithPool: { _id: string; name: string; poolSize: number }[] = []
  for (const t of topicRows) {
    const poolSize = poolByTopic.get(t._id) ?? 0
    if (poolSize >= 5) topicsWithPool.push({ _id: t._id, name: t.name, poolSize })
  }
  const topicIdSet = new Set(topicsWithPool.map(t => t._id))
  const assignmentsByCell = new Map<string, (typeof allAssignments)[number][]>()
  for (const a of allAssignments)
    if (topicIdSet.has(a.topicId)) {
      const k = cellKey(a.userId, a.topicId)
      const list = assignmentsByCell.get(k)
      if (list) list.push(a)
      else assignmentsByCell.set(k, [a])
    }
  const assignedPassByCell = new Set<string>()
  for (const p of allPasses)
    if (p.kind === 'assigned' && topicIdSet.has(p.topicId)) assignedPassByCell.add(cellKey(p.userId, p.topicId))
  const failedCountByUser = new Map<string, number>()
  for (const a of allFailedAttempts)
    if ((a.finishedAt ?? a.startedAt) >= cycleStartMs)
      failedCountByUser.set(a.userId, (failedCountByUser.get(a.userId) ?? 0) + 1)
  const users: UserTrain[] = filterRealProfiles(userRows).map(u => ({
    assigned: 0,
    department: u.department,
    details: [],
    failedAttempts: failedCountByUser.get(u.userId) ?? 0,
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
  const cctx: CellCtx = { assignedPassByCell, assignmentsByCell, dueMs, now }
  for (const u of users) for (const t of topics) tallyCell(u, t, cctx)
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
    let sumAssigned = 0
    let sumPassed = 0
    for (const t of topics) {
      sumAssigned += t.assigned
      sumPassed += t.passed
    }
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
    // oxlint-disable-next-line unicorn/max-nested-calls
    assigneds: v.optional(v.array(v.string())),
    // oxlint-disable-next-line unicorn/max-nested-calls
    deadlines: v.optional(v.array(v.string())),
    // oxlint-disable-next-line unicorn/max-nested-calls
    departments: v.optional(v.array(v.string())),
    page: v.optional(v.number()),
    // oxlint-disable-next-line unicorn/max-nested-calls
    statuses: v.optional(v.array(v.string())),
    // oxlint-disable-next-line unicorn/max-nested-calls
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
    const profiles = filterRealProfiles(
      await ctx.db
        .query('userProfiles')
        .withIndex('by_role', q => q.eq('role', 'user'))
        .take(5000)
    )
    const deptOf = new Map(profiles.map(p => [p.userId, p.department ?? '—']))
    const live = await ctx.db
      .query('testAssignments')
      .order('desc')
      .filter(q => q.eq(q.field('deletedAt'), undefined))
      .take(5000)
    const topicNames = new Map<string, string>()
    const all: AssignRow[] = []
    for (const a of live)
      if (deptOf.has(a.userId)) {
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
const VN_DIACRITIC_RE = /[\u0300-\u036F]/gu
const NON_SLUG_RE = /[^a-z0-9]+/gu
// eslint-disable-next-line sonarjs/super-linear-regex -- anchored single-run quantifiers (^-+, -+$), disjoint, no ambiguous adjacency, linear
const TRIM_HYPHEN_RE = /^-+|-+$/gu
const slugify = (s: string): string =>
  s
    .normalize('NFD')
    .replaceAll(VN_DIACRITIC_RE, '')
    .replaceAll('đ', 'd')
    .replaceAll('Đ', 'D')
    .toLowerCase()
    .replaceAll(NON_SLUG_RE, '-')
    .replaceAll(TRIM_HYPHEN_RE, '')
interface UserSummaryRow {
  assigned: number
  department: string
  failedAttempts: number
  overdue: number
  passed: number
  userId: string
}
const userSummary = query({
  args: { needsCoaching: v.optional(v.boolean()), page: v.optional(v.number()), search: v.optional(v.string()) },
  handler: async (
    ctx,
    { page, search, needsCoaching }
  ): Promise<null | { pageCount: number; rows: UserSummaryRow[]; total: number }> => {
    const adminEmail = await requireAdmin(ctx)
    if (!adminEmail) return null
    const { users } = await computeTrain(ctx)
    const term = (search ?? '').trim().toLowerCase()
    const termFiltered = term ? users.filter(u => u.userId.toLowerCase().includes(term)) : users
    const coachingFiltered = needsCoaching
      ? termFiltered.filter(u => u.failedAttempts >= COACHING_THRESHOLD)
      : termFiltered
    const filtered = coachingFiltered.map(u => ({
      assigned: u.assigned,
      department: u.department ?? '—',
      failedAttempts: u.failedAttempts,
      overdue: u.overdue,
      passed: u.passed,
      userId: u.userId
    }))
    const sorted = filtered.toSorted(
      (a, b) =>
        b.failedAttempts - a.failedAttempts ||
        b.overdue - a.overdue ||
        b.assigned - b.passed - (a.assigned - a.passed) ||
        a.userId.localeCompare(b.userId)
    )
    const pageSize = 25
    const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
    const p = Math.min(Math.max(0, page ?? 0), pageCount - 1)
    return { pageCount, rows: sorted.slice(p * pageSize, p * pageSize + pageSize), total: sorted.length }
  }
})
const coachingSummary = query({
  args: {},
  handler: async (ctx): Promise<null | { threshold: number; userCount: number }> => {
    const adminEmail = await requireAdmin(ctx)
    if (!adminEmail) return null
    const { users } = await computeTrain(ctx)
    return {
      threshold: COACHING_THRESHOLD,
      userCount: users.filter(u => u.failedAttempts >= COACHING_THRESHOLD).length
    }
  }
})
interface AttemptHistoryRow {
  finishedAt?: number
  score?: number
  startedAt: number
  status: 'cancelled' | 'failed' | 'in-progress' | 'passed'
  topicName: string
}
const userAttemptHistory = query({
  args: { userId: v.string() },
  handler: async (
    ctx,
    { userId }
  ): Promise<null | { attempts: AttemptHistoryRow[]; failedTopics: string[]; userId: string }> => {
    const adminEmail = await requireAdmin(ctx)
    if (!adminEmail) return null
    // biome-ignore lint/nursery/noPlaywrightUselessAwait: Convex .first() returns thenable
    const profile = await ctx.db
      .query('userProfiles')
      .withIndex('by_userId', q => q.eq('userId', userId))
      .first()
    if (!(profile && isRealProfile(profile))) return null
    const attemptRows = await ctx.db
      .query('testAttempts')
      .withIndex('by_user_topic', q => q.eq('userId', userId))
      .take(500)
    const sorted = attemptRows.toSorted((a, b) => b.startedAt - a.startedAt)
    const topicNames = new Map<string, string>()
    const attempts: AttemptHistoryRow[] = []
    for (const a of sorted) {
      let name = topicNames.get(a.topicId)
      if (!name) {
        const t = await ctx.db.get(a.topicId)
        name = (t && 'name' in t ? (t as { name?: string }).name : undefined) ?? '?'
        topicNames.set(a.topicId, name)
      }
      attempts.push({
        finishedAt: a.finishedAt,
        score: a.score,
        startedAt: a.startedAt,
        status: a.status,
        topicName: name
      })
    }
    const failedTopics = [...new Set(attempts.filter(a => a.status === 'failed').map(a => a.topicName))]
    return { attempts, failedTopics, userId }
  }
})
interface UserSummaryFullRow {
  assigned: number
  department: string
  failedAttempts: number
  lastAttemptMs?: number
  mostFailedTopic?: string
  overdue: number
  passed: number
  passRate: number
  role: string
  userId: string
}
const userSummaryFull = query({
  args: {
    // oxlint-disable-next-line unicorn/max-nested-calls
    departments: v.optional(v.array(v.string())),
    needsCoaching: v.optional(v.boolean()),
    search: v.optional(v.string())
  },
  handler: async (
    ctx,
    { search, departments, needsCoaching }
  ): Promise<null | { departments: string[]; rows: UserSummaryFullRow[]; total: number }> => {
    const adminEmail = await requireAdmin(ctx)
    if (!adminEmail) return null
    const { users } = await computeTrain(ctx)
    const allDepartments = [...new Set(users.map(u => u.department ?? '—'))].toSorted((a, b) => a.localeCompare(b))
    const attemptsByUser = new Map<string, { failedByTopic: Map<string, number>; lastAt: number }>()
    for (const u of users) {
      const rows = await ctx.db
        .query('testAttempts')
        .withIndex('by_user_topic', q => q.eq('userId', u.userId))
        .take(500)
      const rec = { failedByTopic: new Map<string, number>(), lastAt: 0 }
      for (const a of rows) {
        const at = a.finishedAt ?? a.startedAt
        if (at > rec.lastAt) rec.lastAt = at
        if (a.status === 'failed') {
          const topic = await ctx.db.get(a.topicId)
          const name = (topic && 'name' in topic ? (topic as { name?: string }).name : undefined) ?? '?'
          rec.failedByTopic.set(name, (rec.failedByTopic.get(name) ?? 0) + 1)
        }
      }
      attemptsByUser.set(u.userId, rec)
    }
    const term = (search ?? '').trim().toLowerCase()
    const projected: UserSummaryFullRow[] = users.map(u => {
      const dept = u.department ?? '—'
      const rec = attemptsByUser.get(u.userId)
      const topFailed =
        rec && rec.failedByTopic.size > 0
          ? [...rec.failedByTopic.entries()].toSorted((a, b) => b[1] - a[1])[0]?.[0]
          : undefined
      return {
        assigned: u.assigned,
        department: dept,
        failedAttempts: u.failedAttempts,
        lastAttemptMs: rec && rec.lastAt > 0 ? rec.lastAt : undefined,
        mostFailedTopic: topFailed,
        overdue: u.overdue,
        passRate: u.assigned > 0 ? Math.round((u.passed / u.assigned) * 100) : 0,
        passed: u.passed,
        role: 'user',
        userId: u.userId
      }
    })
    const filtered = projected
      .filter(r => term === '' || r.userId.toLowerCase().includes(term))
      .filter(r => !departments || departments.length === 0 || departments.includes(r.department))
      .filter(r => !needsCoaching || r.failedAttempts >= COACHING_THRESHOLD)
    const sorted = filtered.toSorted(
      (a, b) =>
        b.failedAttempts - a.failedAttempts ||
        b.overdue - a.overdue ||
        a.passRate - b.passRate ||
        a.userId.localeCompare(b.userId)
    )
    return { departments: allDepartments, rows: sorted, total: sorted.length }
  }
})
type CellClass =
  | { bucket: 'never'; isOverdue: boolean; row: TestDetailPersonRow }
  | { bucket: 'pass'; isOverdue: false; row: TestDetailPersonRow }
  | { bucket: 'skip'; isOverdue: false }
  | { bucket: 'struggle'; isOverdue: boolean; row: TestDetailPersonRow }
interface ClassifyArgs {
  dueMs: number
  now: number
  topicId: Id<'topics'>
  u: { department?: string; userId: string }
}
interface TestDetailPersonRow {
  attemptCount: number
  department: string
  lastAt?: number
  lastScore?: number
  status: 'failed' | 'in-progress' | 'never-started' | 'passed'
  userId: string
}
interface TestDetailQuestion {
  choices: string[]
  correctIndex: number
  prompt: string
  questionId: string
}
const classifyUserForTest = async (ctx: QueryCtx, args: ClassifyArgs): Promise<CellClass> => {
  const { u, topicId, dueMs, now } = args
  const dept = u.department ?? '—'
  const assignmentRows = await ctx.db
    .query('testAssignments')
    .withIndex('by_user_topic', q => q.eq('userId', u.userId).eq('topicId', topicId))
    .filter(q => q.eq(q.field('deletedAt'), undefined))
    .collect()
  if (assignmentRows.length === 0) return { bucket: 'skip', isOverdue: false }
  const passRows = await ctx.db
    .query('testPasses')
    .withIndex('by_user_topic_kind', q => q.eq('userId', u.userId).eq('topicId', topicId).eq('kind', 'assigned'))
    .collect()
  const attemptRows = await ctx.db
    .query('testAttempts')
    .withIndex('by_user_topic', q => q.eq('userId', u.userId).eq('topicId', topicId))
    .collect()
  const sortedAttempts = attemptRows.toSorted((a, b) => (b.finishedAt ?? b.startedAt) - (a.finishedAt ?? a.startedAt))
  const last = sortedAttempts[0]
  if (passRows[0]) {
    const passAttempt = sortedAttempts.find(a => a.status === 'passed') ?? last
    return {
      bucket: 'pass',
      isOverdue: false,
      row: {
        attemptCount: attemptRows.length,
        department: dept,
        lastAt: passAttempt?.finishedAt ?? passAttempt?.startedAt,
        lastScore: passAttempt?.score,
        status: 'passed',
        userId: u.userId
      }
    }
  }
  const effectiveDue = Math.min(...assignmentRows.map(r => r.dueAtMs ?? r.createdAt + dueMs))
  const isOverdue = now > effectiveDue
  if (attemptRows.length === 0)
    return {
      bucket: 'never',
      isOverdue,
      row: { attemptCount: 0, department: dept, lastAt: effectiveDue, status: 'never-started', userId: u.userId }
    }
  const failedCount = attemptRows.filter(a => a.status === 'failed').length
  return {
    bucket: 'struggle',
    isOverdue,
    row: {
      attemptCount: failedCount,
      department: dept,
      lastAt: last?.finishedAt ?? last?.startedAt,
      lastScore: last?.score,
      status: last?.status === 'in-progress' ? 'in-progress' : 'failed',
      userId: u.userId
    }
  }
}
const testDetail = query({
  args: { slug: v.string() },
  handler: async (
    ctx,
    { slug }
  ): Promise<null | {
    createdAt: number
    failedCount: number
    name: string
    notStarted: TestDetailPersonRow[]
    overdueCount: number
    passedCount: number
    passRate: number
    questions: TestDetailQuestion[]
    sourceDocs: { _id: string; filename: string }[]
    strugglers: TestDetailPersonRow[]
    topicId: string
    totalAssigned: number
    winners: TestDetailPersonRow[]
    // eslint-disable-next-line sonarjs/cognitive-complexity -- irreducible handler/orchestrator; cohesive helpers already extracted
  }> => {
    const adminEmail = await requireAdmin(ctx)
    if (!adminEmail) return null
    const topicRows = await ctx.db
      .query('topics')
      .withIndex('by_deletedAt', q => q.eq('deletedAt', undefined))
      .take(500)
    const topic = topicRows.find(t => slugify(t.name) === slug)
    if (!topic) return null
    const questions = await ctx.db
      .query('testQuestions')
      .withIndex('by_topic_deletedAt', q => q.eq('topicId', topic._id).eq('deletedAt', undefined))
      .take(200)
    const sourceDocIds = new Set<string>()
    for (const q of questions) for (const id of q.sourceDocIds) sourceDocIds.add(id)
    const sourceDocs: { _id: string; filename: string }[] = []
    for (const id of sourceDocIds) {
      const d = await ctx.db.get(id as never)
      if (d && 'filename' in d && !(d as { deletedAt?: number }).deletedAt)
        sourceDocs.push({ _id: id, filename: (d as { filename: string }).filename })
    }
    const userRows = filterRealProfiles(
      await ctx.db
        .query('userProfiles')
        .withIndex('by_role', q => q.eq('role', 'user'))
        .take(2000)
    )
    const dueMs = (await getDueDays(ctx)) * DAY_MS
    const now = Date.now()
    const winners: TestDetailPersonRow[] = []
    const strugglers: TestDetailPersonRow[] = []
    const notStarted: TestDetailPersonRow[] = []
    let overdueCount = 0
    let totalAssigned = 0
    for (const u of userRows) {
      const c = await classifyUserForTest(ctx, { dueMs, now, topicId: topic._id, u })
      if (c.bucket !== 'skip') {
        totalAssigned += 1
        if (c.isOverdue) overdueCount += 1
        if (c.bucket === 'pass') winners.push(c.row)
        else if (c.bucket === 'never') notStarted.push(c.row)
        else strugglers.push(c.row)
      }
    }
    winners.sort((a, b) => (b.lastAt ?? 0) - (a.lastAt ?? 0))
    strugglers.sort((a, b) => b.attemptCount - a.attemptCount || (b.lastAt ?? 0) - (a.lastAt ?? 0))
    notStarted.sort((a, b) => (a.lastAt ?? 0) - (b.lastAt ?? 0))
    return {
      createdAt: topic.createdAt,
      failedCount: ((): number => {
        let s = 0
        for (const r of strugglers) s += r.attemptCount
        return s
      })(),
      name: topic.name,
      notStarted,
      overdueCount,
      passRate: totalAssigned > 0 ? Math.round((winners.length / totalAssigned) * 100) : 0,
      passedCount: winners.length,
      questions: questions.map(q => ({
        choices: q.choices,
        correctIndex: q.correctIndex,
        prompt: q.prompt,
        questionId: q._id
      })),
      sourceDocs,
      strugglers,
      topicId: topic._id,
      totalAssigned,
      winners
    }
  }
})
interface TestsFullRow {
  assigned: number
  createdAt: number
  lastActivityMs?: number
  name: string
  overdue: number
  passRate: number
  poolSize: number
  slug: string
  sourceDocsCount: number
  topicId: string
}
const testsFull = query({
  args: { search: v.optional(v.string()) },
  // eslint-disable-next-line sonarjs/cognitive-complexity -- irreducible query handler: admin test-summary aggregation + search-filter request wiring
  handler: async (ctx, { search }): Promise<null | { rows: TestsFullRow[]; total: number }> => {
    const adminEmail = await requireAdmin(ctx)
    if (!adminEmail) return null
    const { topics } = await computeTrain(ctx)
    const topicRowsAll = await ctx.db
      .query('topics')
      .withIndex('by_deletedAt', q => q.eq('deletedAt', undefined))
      .take(500)
    const topicsById = new Map(topicRowsAll.map(t => [t._id, t]))
    const out: TestsFullRow[] = []
    for (const t of topics) {
      const topic = topicsById.get(t.topicId as never)
      const questions = await ctx.db
        .query('testQuestions')
        .withIndex('by_topic_deletedAt', q => q.eq('topicId', t.topicId as never).eq('deletedAt', undefined))
        .take(200)
      const sourceIds = new Set<string>()
      for (const q of questions) for (const id of q.sourceDocIds) sourceIds.add(id)
      const attemptRows = await ctx.db
        .query('testAttempts')
        .withIndex('by_topic_status', q => q.eq('topicId', t.topicId as never))
        .take(500)
      let lastAt = 0
      for (const a of attemptRows) {
        const at = a.finishedAt ?? a.startedAt
        if (at > lastAt) lastAt = at
      }
      out.push({
        assigned: t.assigned,
        createdAt: topic?.createdAt ?? 0,
        lastActivityMs: lastAt > 0 ? lastAt : undefined,
        name: t.name,
        overdue: t.overdue,
        passRate: t.assigned > 0 ? Math.round((t.passed / t.assigned) * 100) : 0,
        poolSize: t.poolSize,
        slug: slugify(t.name),
        sourceDocsCount: sourceIds.size,
        topicId: t.topicId
      })
    }
    const term = (search ?? '').trim().toLowerCase()
    const filtered = term ? out.filter(r => r.name.toLowerCase().includes(term)) : out
    return { rows: filtered, total: filtered.length }
  }
})
const topicSlugs = query({
  args: {},
  handler: async (ctx): Promise<{ name: string; poolSize: number; slug: string }[]> => {
    const adminEmail = await requireAdmin(ctx)
    if (!adminEmail) return []
    const topicRows = await ctx.db
      .query('topics')
      .withIndex('by_deletedAt', q => q.eq('deletedAt', undefined))
      .take(500)
    const out: { name: string; poolSize: number; slug: string }[] = []
    for (const t of topicRows) {
      const pool = await ctx.db
        .query('testQuestions')
        .withIndex('by_topic_deletedAt', q => q.eq('topicId', t._id).eq('deletedAt', undefined))
        .take(200)
      out.push({ name: t.name, poolSize: pool.length, slug: slugify(t.name) })
    }
    return out
  }
})
export {
  assignmentsTable,
  coachingSummary,
  costCycleHistory,
  costCyclePivot,
  testDetail,
  testsFull,
  topicSlugs,
  topStrip,
  trainingSummary,
  userAttemptHistory,
  userSummary,
  userSummaryFull
}
