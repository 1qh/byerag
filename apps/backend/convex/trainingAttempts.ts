/** biome-ignore-all lint/performance/noAwaitInLoops: sequential Convex DB ops */
/** biome-ignore-all lint/nursery/noContinue: control flow shape */
/** biome-ignore-all lint/nursery/noShadow: scoped shadows ok */
/* oxlint-disable eslint(no-await-in-loop), eslint(complexity), eslint(no-shadow), eslint(no-unused-vars), eslint(no-sequences), unicorn(no-array-reduce), unicorn(prefer-ternary), eslint(max-params) */
import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
const REQUIRED_PER_ATTEMPT = 5
const POOL_MIN = 5
const shuffle = <T>(arr: T[]): T[] => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const ai = a[i]
    const aj = a[j]
    if (ai !== undefined && aj !== undefined) {
      a[i] = aj
      a[j] = ai
    }
  }
  return a
}
const requireUserEmail = async (ctx: {
  auth: { getUserIdentity: () => Promise<null | { email?: string }> }
}): Promise<string> => {
  const identity = await ctx.auth.getUserIdentity()
  const email = identity?.email?.toLowerCase()
  if (!email) throw new Error('not authenticated')
  return email
}
const startAttempt = mutation({
  args: { topicId: v.id('topics') },
  handler: async (ctx, { topicId }): Promise<{ attemptId: string }> => {
    const userId = await requireUserEmail(ctx)
    const pool = await ctx.db
      .query('testQuestions')
      .withIndex('by_topic_deletedAt', q => q.eq('topicId', topicId).eq('deletedAt', undefined))
      .take(500)
    if (pool.length < POOL_MIN) throw new Error(`pool too small: ${pool.length}/${POOL_MIN}`)
    const picked = shuffle(pool).slice(0, REQUIRED_PER_ATTEMPT)
    const liveAssignRows = await ctx.db
      .query('testAssignments')
      .withIndex('by_user_topic', q => q.eq('userId', userId).eq('topicId', topicId))
      .filter(q => q.eq(q.field('deletedAt'), undefined))
      .collect()
    const kind: 'assigned' | 'self' = liveAssignRows[0] ? 'assigned' : 'self'
    const priorRows = await ctx.db
      .query('testAttempts')
      .withIndex('by_user_topic', q => q.eq('userId', userId).eq('topicId', topicId))
      .collect()
    const prior = priorRows[0]
    if (prior) await ctx.db.patch(prior._id, { cancelledReason: 'new-attempt-started', status: 'cancelled' })
    const questionSnapshots = picked.map(q => {
      const order = shuffle([0, 1, 2])
      const choicesShuffled = order.map(i => q.choices[i] ?? '')
      const correctIndexShuffled = order.indexOf(q.correctIndex)
      return {
        choicesShuffled,
        correctIndexShuffled,
        promptText: q.prompt,
        questionId: q._id,
        revision: q.revision,
        sourceDocIds: q.sourceDocIds
      }
    })
    const attemptId = await ctx.db.insert('testAttempts', {
      kind,
      questionSnapshots,
      startedAt: Date.now(),
      status: 'in-progress',
      topicId,
      userId
    })
    return { attemptId }
  }
})
const submitAttempt = mutation({
  args: { answers: v.array(v.number()), attemptId: v.id('testAttempts') },
  handler: async (ctx, { attemptId, answers }): Promise<{ passed: boolean; score: number }> => {
    const userId = await requireUserEmail(ctx)
    const attempt = await ctx.db.get(attemptId)
    if (!attempt) throw new Error('attempt not found')
    if (attempt.userId !== userId) throw new Error('forbidden')
    if (attempt.status !== 'in-progress') throw new Error(`attempt already ${attempt.status}`)
    if (answers.length !== attempt.questionSnapshots.length) throw new Error('answers length mismatch')
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
      const priorPassRows = await ctx.db
        .query('testPasses')
        .withIndex('by_user_topic_kind', q =>
          q.eq('userId', userId).eq('topicId', attempt.topicId).eq('kind', attempt.kind)
        )
        .collect()
      const priorPass = priorPassRows[0]
      await (priorPass
        ? ctx.db.patch(priorPass._id, { attemptId, passedAt: finishedAt })
        : ctx.db.insert('testPasses', {
            attemptId,
            kind: attempt.kind,
            passedAt: finishedAt,
            topicId: attempt.topicId,
            userId
          }))
    }
    return { passed, score }
  }
})
const listMyAttempts = query({
  args: {},
  handler: async (
    ctx
  ): Promise<
    { _id: string; finishedAt?: number; score?: number; startedAt: number; status: string; topicId: string }[]
  > => {
    const identity = await ctx.auth.getUserIdentity()
    const userId = identity?.email?.toLowerCase()
    if (!userId) return []
    const rows = await ctx.db
      .query('testAttempts')
      .withIndex('by_user', q => q.eq('userId', userId))
      .order('desc')
      .take(100)
    return rows.map(r => ({
      _id: r._id,
      finishedAt: r.finishedAt,
      score: r.score,
      startedAt: r.startedAt,
      status: r.status,
      topicId: r.topicId
    }))
  }
})
const getMyAttemptDetail = query({
  args: { attemptId: v.id('testAttempts') },
  handler: async (ctx, { attemptId }) => {
    const identity = await ctx.auth.getUserIdentity()
    const userId = identity?.email?.toLowerCase()
    if (!userId) return null
    const row = await ctx.db.get(attemptId)
    if (row?.userId !== userId) return null
    if (row.status === 'passed') return row
    return { _id: row._id, score: row.score ?? 0, status: row.status, total: row.questionSnapshots.length }
  }
})
export { getMyAttemptDetail, listMyAttempts, startAttempt, submitAttempt }
