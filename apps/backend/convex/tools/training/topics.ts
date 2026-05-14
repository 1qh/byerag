import { defineQuery } from '../_api'
const action = defineQuery({
  args: {},
  cost: 'low',
  description: 'Topic list with pool sizes; no question content.',
  errorCodes: [],
  examples: ['training topics'],
  handler: async ctx => {
    const topics = await ctx.db
      .query('topics')
      .withIndex('by_deletedAt', q => q.eq('deletedAt', undefined))
      .take(500)
    const out: { _id: string; name: string; poolSize: number }[] = []
    for (const t of topics) {
      const pool = await ctx.db
        .query('testQuestions')
        .withIndex('by_topic_deletedAt', q => q.eq('topicId', t._id).eq('deletedAt', undefined))
        .take(60)
      out.push({ _id: t._id, name: t.name, poolSize: pool.length })
    }
    return { topics: out }
  }
})
export { action }
