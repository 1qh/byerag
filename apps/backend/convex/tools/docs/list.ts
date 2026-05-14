import { arg, defineQuery } from '../_api'
const SCOPES = ['shared', 'mine', 'both'] as const
const action = defineQuery({
  args: {
    limit: arg.number({ default: 50, description: 'Max rows (cap 200)' }),
    scope: arg.enum(SCOPES, { description: 'Visibility scope' })
  },
  cost: 'low',
  description: 'List approved corpus documents in scope. Returns id, filename, mime, size, uploadedAt, scope.',
  errorCodes: [],
  examples: ['docs list --scope shared', 'docs list --scope both --limit 20'],
  handler: async (ctx, args) => {
    const cap = Math.min(args.limit, 200)
    const wantShared = args.scope === 'shared' || args.scope === 'both'
    const wantMine = args.scope === 'mine' || args.scope === 'both'
    const sharedRows = wantShared
      ? await ctx.db
          .query('docs')
          .withIndex('by_scope_uploadedAt', q => q.eq('scope', 'shared'))
          .filter(q =>
            q.and(
              q.eq(q.field('deletedAt'), undefined),
              q.eq(q.field('supersededBy'), undefined),
              q.eq(q.field('policyStatus'), 'approved'),
              q.eq(q.field('scanStatus'), 'clean')
            )
          )
          .order('desc')
          .take(cap)
      : []
    const mineRows = wantMine
      ? await ctx.db
          .query('docs')
          .withIndex('by_scope_uploadedAt', q => q.eq('scope', 'mine'))
          .filter(q =>
            q.and(
              q.eq(q.field('owner'), ctx.auth.owner),
              q.eq(q.field('deletedAt'), undefined),
              q.eq(q.field('supersededBy'), undefined),
              q.eq(q.field('policyStatus'), 'approved'),
              q.eq(q.field('scanStatus'), 'clean')
            )
          )
          .order('desc')
          .take(cap)
      : []
    return [...sharedRows, ...mineRows]
      .toSorted((a, b) => b.uploadedAt - a.uploadedAt)
      .slice(0, cap)
      .map(r => ({
        _id: r._id,
        fileSize: r.fileSize,
        filename: r.filename,
        mime: r.mime,
        scope: r.scope,
        uploadedAt: r.uploadedAt
      }))
  }
})
export { action }
