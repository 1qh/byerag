import { defineQuery } from '../_api'
const action = defineQuery({
  args: {},
  cost: 'low',
  description: "Caller's training status per topic: poolSize + myStatus (passed-assigned, passed-self, not-attempted).",
  errorCodes: [],
  examples: ['training status'],
  handler: async ctx => {
    const userId = ctx.auth.owner
    const topics = await ctx.db
      .query('topics')
      .withIndex('by_deletedAt', q => q.eq('deletedAt', undefined))
      .take(500)
    const out: { _id: string; myStatus: string; name: string; poolSize: number }[] = []
    for (const t of topics) {
      const pool = await ctx.db
        .query('testQuestions')
        .withIndex('by_topic_deletedAt', q => q.eq('topicId', t._id).eq('deletedAt', undefined))
        .take(6)
      const pass = ctx.db
        .query('testPasses')
        .withIndex('by_user_topic_kind', q => q.eq('userId', userId).eq('topicId', t._id).eq('kind', 'assigned'))
        .first()
      const selfPass = ctx.db
        .query('testPasses')
        .withIndex('by_user_topic_kind', q => q.eq('userId', userId).eq('topicId', t._id).eq('kind', 'self'))
        .first()
      out.push({
        _id: t._id,
        myStatus: pass ? 'passed-assigned' : selfPass ? 'passed-self' : 'not-attempted',
        name: t.name,
        poolSize: pool.length
      })
    }
    return { topics: out }
  }
})
export { action }
