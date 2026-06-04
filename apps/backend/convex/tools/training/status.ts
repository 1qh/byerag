/* eslint-disable no-await-in-loop, no-continue */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential Convex DB ops */
/** biome-ignore-all lint/nursery/noContinue: pool-floor early-exit */
import { DEFAULT_DUE_DAYS, deriveUrgency } from '../../lib/trainingUrgency'
import { defineQuery } from '../_api'

const action = defineQuery({
  args: {},
  cost: 'low',
  description:
    "Caller's per-topic training state with urgency and deadline. Each topic carries name, poolSize, urgency (overdue|due-soon|open|passed-assigned|passed-self), and where relevant effectiveDueAtMs + overdueDays / dueInDays. Use this to answer 'what tests do I need to take', 'what's overdue', 'what's left'. Always link the user to /training to act.",
  errorCodes: [],
  examples: ['training status'],
  handler: async ctx => {
    const userId = ctx.auth.owner
    const now = Date.now()
    // biome-ignore lint/nursery/noPlaywrightUselessAwait: Convex .first() returns thenable
    const dueDaysRow = await ctx.db
      .query('settings')
      .withIndex('by_key', q => q.eq('key', 'assignment_due_days'))
      .first()
    const dueDays = Number(dueDaysRow?.value ?? DEFAULT_DUE_DAYS)
    const dueMs = (Number.isFinite(dueDays) ? dueDays : DEFAULT_DUE_DAYS) * 86_400_000
    const topics = await ctx.db
      .query('topics')
      .withIndex('by_deletedAt', q => q.eq('deletedAt', undefined))
      .take(500)
    interface Row {
      _id: string
      assigned: boolean
      assignedAtMs?: number
      dueInDays?: number
      effectiveDueAtMs?: number
      estimatedMinutes: number
      humanDueDate?: string
      name: string
      overdueDays?: number
      poolSize: number
      startUrl: string
      urgency: ReturnType<typeof deriveUrgency>['urgency']
    }
    const QUESTIONS_PER_ATTEMPT = 5
    const MINUTES_PER_QUESTION = 0.6
    const VN_TZ_OFFSET_MS = 7 * 3_600_000
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const fmtVNDate = (ms: number): string => {
      const d = new Date(ms + VN_TZ_OFFSET_MS)
      return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
    }
    const out: Row[] = []
    for (const t of topics) {
      const pool = await ctx.db
        .query('testQuestions')
        .withIndex('by_topic_deletedAt', q => q.eq('topicId', t._id).eq('deletedAt', undefined))
        .take(6)
      if (pool.length < 5) continue
      const assignmentRows = await ctx.db
        .query('testAssignments')
        .withIndex('by_user_topic', q => q.eq('userId', userId).eq('topicId', t._id))
        .filter(q => q.eq(q.field('deletedAt'), undefined))
        .collect()
      const assignedPasses = await ctx.db
        .query('testPasses')
        .withIndex('by_user_topic_kind', q => q.eq('userId', userId).eq('topicId', t._id).eq('kind', 'assigned'))
        .collect()
      const selfPasses = await ctx.db
        .query('testPasses')
        .withIndex('by_user_topic_kind', q => q.eq('userId', userId).eq('topicId', t._id).eq('kind', 'self'))
        .collect()
      const u = deriveUrgency({
        assignedPassed: assignedPasses.length > 0,
        assignmentRows,
        dueMs,
        now,
        selfPassed: selfPasses.length > 0
      })
      const earliestAssignedAt = assignmentRows.length > 0 ? Math.min(...assignmentRows.map(r => r.createdAt)) : undefined
      out.push({
        _id: t._id,
        assigned: assignmentRows.length > 0,
        assignedAtMs: earliestAssignedAt,
        dueInDays: u.dueInDays,
        effectiveDueAtMs: u.effectiveDueAtMs,
        estimatedMinutes: Math.max(1, Math.ceil(QUESTIONS_PER_ATTEMPT * MINUTES_PER_QUESTION)),
        humanDueDate: u.effectiveDueAtMs === undefined ? undefined : fmtVNDate(u.effectiveDueAtMs),
        name: t.name,
        overdueDays: u.overdueDays,
        poolSize: pool.length,
        startUrl: '/training',
        urgency: u.urgency
      })
    }
    const counts = {
      assigned: out.filter(r => r.assigned && r.urgency !== 'passed-assigned').length,
      dueSoon: out.filter(r => r.urgency === 'due-soon').length,
      open: out.filter(r => r.urgency === 'open').length,
      overdue: out.filter(r => r.urgency === 'overdue').length,
      passed: out.filter(r => r.urgency === 'passed-assigned' || r.urgency === 'passed-self').length
    }
    return { counts, nowMs: now, topics: out }
  }
})
export { action }
