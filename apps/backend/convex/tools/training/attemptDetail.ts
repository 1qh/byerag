import { arg, defineQuery, makeFail } from '../_api'
const action = defineQuery({
  args: { id: arg.string({ description: 'testAttempts._id' }) },
  cost: 'low',
  description:
    "Caller's own attempt detail. Full snapshot only on status=passed; failed/cancelled returns score+total only.",
  errorCodes: ['FORBIDDEN', 'NOT_FOUND'],
  examples: ['training attempt-detail --id <attemptId>'],
  handler: async (ctx, args) => {
    const fail = makeFail('FORBIDDEN', 'NOT_FOUND')
    interface Row {
      _id: string
      kind: string
      questionSnapshots: {
        choicesShuffled: string[]
        correctIndexShuffled: number
        promptText: string
        sourceDocIds: string[]
      }[]
      score?: number
      status: string
      topicId: string
      userId: string
    }
    const row = (await ctx.db.get(args.id as never)) as null | Row
    if (!row) throw fail('NOT_FOUND', `attempt ${args.id} not found`)
    if (row.userId !== ctx.auth.owner) throw fail('FORBIDDEN', 'not your attempt')
    if (row.status === 'passed') return row
    return {
      _id: row._id,
      kind: row.kind,
      score: row.score ?? 0,
      status: row.status,
      topicId: row.topicId,
      total: row.questionSnapshots.length
    }
  }
})
export { action }
