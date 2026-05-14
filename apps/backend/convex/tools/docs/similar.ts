import type { Id } from '../../_generated/dataModel'
import { internal } from '../../_generated/api'
import { embedQuery } from '../../docsEmbed'
import { arg, defineTool } from '../_api'
const SCOPES = ['shared', 'mine', 'both'] as const
interface SnippetRow {
  _id: Id<'docs'>
  filename: string
  scope: 'mine' | 'shared'
  snippet: string
}
const action = defineTool({
  args: {
    dim: arg.enum(['256', '512', '768'], { default: '768', description: 'Matryoshka prefix dim' }),
    limit: arg.number({ default: 10, description: 'Max hits (cap 50)' }),
    query: arg.string({ description: 'Natural-language query text' }),
    scope: arg.enum(SCOPES, { description: 'Visibility scope' })
  },
  cost: 'medium',
  description: 'Vector similarity over docs.embedding. Returns top-K w/ cosine score, filename, snippet.',
  errorCodes: ['UPSTREAM_ERROR'],
  examples: ['byerag docs similar --query "PTO policy" --scope shared'],
  handler: async (ctx, args) => {
    const cap = Math.min(args.limit, 50)
    const vec = await embedQuery(args.query)
    const wantShared = args.scope === 'shared' || args.scope === 'both'
    const wantMine = args.scope === 'mine' || args.scope === 'both'
    const hits: { _id: Id<'docs'>; _score: number }[] = []
    if (wantShared) {
      const r = await ctx.vectorSearch('docs', 'by_embedding', {
        filter: q => q.eq('scope', 'shared'),
        limit: cap,
        vector: vec
      })
      hits.push(...r.map(h => ({ _id: h._id, _score: h._score })))
    }
    if (wantMine) {
      const r = await ctx.vectorSearch('docs', 'by_embedding', {
        filter: q => q.and(q.eq('scope', 'mine'), q.eq('owner', ctx.auth.owner)),
        limit: cap,
        vector: vec
      })
      hits.push(...r.map(h => ({ _id: h._id, _score: h._score })))
    }
    const top = hits.toSorted((a, b) => b._score - a._score).slice(0, cap)
    const rows = (await ctx.runQuery(internal.docs.getRowsSnippet, { ids: top.map(h => h._id) })) as SnippetRow[]
    const byId = new Map(rows.map(r => [r._id, r]))
    return top
      .map(h => {
        const row = byId.get(h._id)
        if (!row) return null
        return { _id: h._id, _score: h._score, filename: row.filename, scope: row.scope, snippet: row.snippet }
      })
      .filter(
        (x): x is { _id: Id<'docs'>; _score: number; filename: string; scope: 'mine' | 'shared'; snippet: string } =>
          x !== null
      )
  }
})
export { action }
