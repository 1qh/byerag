import { arg, defineQuery, makeFail } from '../_api'
const SCOPES = ['shared', 'mine', 'both'] as const
const MAX_HITS = 200
const SNIPPET_CHARS = 160
const action = defineQuery({
  args: {
    limit: arg.number({ default: 50, description: 'Max hits (cap 200)' }),
    pattern: arg.string({ description: 'RE2-flavored regex' }),
    scope: arg.enum(SCOPES, { description: 'Visibility scope' })
  },
  cost: 'medium',
  description: 'Regex match across docs in scope. Returns {docId, filename, lineNumber, snippet} tuples.',
  errorCodes: ['INVALID_ARG'],
  examples: ['docs grep --pattern "warranty" --scope shared'],
  handler: async (ctx, args) => {
    const fail = makeFail('INVALID_ARG')
    const cap = Math.min(args.limit, MAX_HITS)
    let regex: RegExp
    try {
      regex = new RegExp(args.pattern, 'gu')
    } catch (error) {
      throw fail('INVALID_ARG', `invalid regex: ${String(error).slice(0, 80)}`)
    }
    const wantShared = args.scope === 'shared' || args.scope === 'both'
    const wantMine = args.scope === 'mine' || args.scope === 'both'
    const collected: { _id: string; extractedText: string; filename: string }[] = []
    if (wantShared) {
      const r = await ctx.db
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
        .take(500)
      for (const d of r)
        if (d.extractedText) collected.push({ _id: d._id, extractedText: d.extractedText, filename: d.filename })
    }
    if (wantMine) {
      const r = await ctx.db
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
        .take(500)
      for (const d of r)
        if (d.extractedText) collected.push({ _id: d._id, extractedText: d.extractedText, filename: d.filename })
    }
    const hits: { docId: string; filename: string; lineNumber: number; snippet: string }[] = []
    for (const doc of collected) {
      const lines = doc.extractedText.split('\n')
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i] ?? ''
        regex.lastIndex = 0
        if (regex.test(line)) {
          hits.push({
            docId: doc._id,
            filename: doc.filename,
            lineNumber: i + 1,
            snippet: line.slice(0, SNIPPET_CHARS)
          })
          if (hits.length >= cap) break
        }
      }
      if (hits.length >= cap) break
    }
    return { hits, truncated: hits.length >= cap }
  }
})
export { action }
