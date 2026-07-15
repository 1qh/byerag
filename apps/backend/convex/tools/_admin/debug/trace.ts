import { arg, defineQuery } from '../../_api'
/** Matches `newTraceId()` — `tr_` plus 16 hex chars. */
const TRACE_ID_PATTERN = '^tr_[0-9a-f]{16}$'
const action = defineQuery({
  args: { trace_id: arg.string({ description: 'Trace id to look up', pattern: TRACE_ID_PATTERN }) },
  cost: 'low',
  description: 'Fetch one dispatch trace by id — args, steps, timing, and error if it failed.',
  errorCodes: ['NOT_FOUND'],
  examples: ['admin debug trace --trace-id tr_0123456789abcdef'],
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query('xTraces')
      .withIndex('by_trace', q => q.eq('traceId', args.trace_id))
      .unique()
    if (!row) return { trace: null }
    return {
      trace: {
        args: row.args,
        command: row.command,
        durationMs: row.durationMs,
        error: row.error,
        inputsResolved: row.inputsResolved,
        mode: row.mode,
        ok: row.ok,
        owner: row.owner,
        steps: row.steps,
        traceId: row.traceId
      }
    }
  }
})
export { action }
