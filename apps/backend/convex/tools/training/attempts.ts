import { arg, defineQuery } from '../_api'

const action = defineQuery({
  args: { limit: arg.number({ default: 50, description: 'Max rows (cap 200)', optional: true }) },
  cost: 'low',
  description: "Caller's recent test attempts (latest first).",
  errorCodes: [],
  examples: ['training attempts --limit 20'],
  handler: async (ctx, args) => {
    const cap = Math.min(args.limit ?? 50, 200)
    const userId = ctx.auth.owner
    const rows = await ctx.db
      .query('testAttempts')
      .withIndex('by_user', q => q.eq('userId', userId))
      .order('desc')
      .take(cap)
    return {
      attempts: rows.map(r => ({
        _id: r._id,
        finishedAt: r.finishedAt,
        kind: r.kind,
        score: r.score,
        startedAt: r.startedAt,
        status: r.status,
        topicId: r.topicId
      }))
    }
  }
})
export { action }
