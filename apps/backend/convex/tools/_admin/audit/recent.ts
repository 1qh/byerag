import { arg, defineQuery } from '../../_api'

const action = defineQuery({
  args: { limit: arg.number({ default: 20, description: 'Max rows (cap 100)', max: 100, min: 1 }) },
  cost: 'low',
  description: 'Most recent audit log entries across owners, newest first.',
  errorCodes: [],
  examples: ['admin audit recent --limit 20'],
  handler: async (ctx, args) => {
    const rows = await ctx.db.query('auditLogs').order('desc').take(args.limit)
    return {
      entries: rows.map(r => ({
        _id: r._id,
        args: r.args,
        command: r.command,
        mode: r.mode,
        ok: r.ok,
        owner: r.owner,
        severity: r.severity
      }))
    }
  }
})
export { action }
