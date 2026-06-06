/* eslint-disable no-await-in-loop */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential Convex DB ops */
import type { Id } from '../../_generated/dataModel'
import { internal } from '../../_generated/api'
import { embedQuery, matryoshkaTruncate } from '../../docsEmbed'
import { arg, defineTool } from '../_api'

const SCOPES = ['shared', 'mine', 'both'] as const
interface ChunkRow {
  _id: Id<'docChunks'>
  docId: Id<'docs'>
  seq: number
  text: string
}
interface SnippetRow {
  _id: Id<'docs'>
  filename: string
  scope: 'mine' | 'shared'
  snippet: string
}
const action = defineTool({
  args: {
    dim: arg.enum(['256', '512', '768'], { default: '768', description: 'Matryoshka prefix dim' }),
    granular: arg.bool({ description: 'Return chunk-level (docId, chunkSeq, snippet, score)', optional: true }),
    limit: arg.number({ default: 10, description: 'Max hits (cap 50)' }),
    query: arg.string({ description: 'Natural-language query text' }),
    scope: arg.enum(SCOPES, { description: 'Visibility scope' })
  },
  cost: 'medium',
  description: 'Vector similarity over docs.embedding. Returns top-K w/ cosine score, filename, snippet.',
  errorCodes: ['UPSTREAM_ERROR'],
  examples: ['docs similar --query "PTO policy" --scope shared'],
  handler: async (ctx, args) => {
    const cap = Math.min(args.limit, 50)
    const full = await embedQuery(args.query)
    const vec = matryoshkaTruncate(full, Number.parseInt(args.dim, 10))
    const wantShared = args.scope === 'shared' || args.scope === 'both'
    const wantMine = args.scope === 'mine' || args.scope === 'both'
    if (args.granular) {
      const docHits: { _id: Id<'docs'>; _score: number }[] = []
      if (wantShared) {
        const r = await ctx.vectorSearch('docs', 'by_embedding', {
          filter: q => q.eq('scope', 'shared'),
          limit: cap,
          vector: vec
        })
        docHits.push(...r.map(h => ({ _id: h._id, _score: h._score })))
      }
      if (wantMine) {
        const r = await ctx.vectorSearch('docs', 'by_embedding', {
          filter: q => q.eq('owner', ctx.auth.owner),
          limit: cap,
          vector: vec
        })
        docHits.push(...r.map(h => ({ _id: h._id, _score: h._score })))
      }
      const docIds = [...new Set(docHits.map(h => h._id))]
      const chunkHits: { _id: Id<'docChunks'>; _score: number }[] = []
      for (const docId of docIds) {
        const r = await ctx.vectorSearch('docChunks', 'by_embedding', {
          filter: q => q.eq('docId', docId),
          limit: cap,
          vector: vec
        })
        chunkHits.push(...r.map(h => ({ _id: h._id, _score: h._score })))
      }
      const topChunks = chunkHits.toSorted((a, b) => b._score - a._score).slice(0, cap)
      const chunks = (await ctx.runQuery(internal.docs.getChunkRows, {
        ids: topChunks.map(h => h._id)
      })) as ChunkRow[]
      const byChunkId = new Map(chunks.map(c => [c._id, c]))
      const granularOut: {
        _id: Id<'docs'>
        _score: number
        chunkSeq: number
        filename: string
        scope: 'mine' | 'shared'
        snippet: string
      }[] = []
      for (const h of topChunks) {
        const row = byChunkId.get(h._id)
        if (row)
          granularOut.push({
            _id: row.docId,
            _score: h._score,
            chunkSeq: row.seq,
            filename: '',
            scope: 'shared',
            snippet: row.text.slice(0, 200)
          })
      }
      return granularOut
    }
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
        filter: q => q.eq('owner', ctx.auth.owner),
        limit: cap,
        vector: vec
      })
      hits.push(...r.map(h => ({ _id: h._id, _score: h._score })))
    }
    const top = hits.toSorted((a, b) => b._score - a._score).slice(0, cap)
    const rows = (await ctx.runQuery(internal.docs.getRowsSnippet, { ids: top.map(h => h._id) })) as SnippetRow[]
    const byId = new Map(rows.map(r => [r._id, r]))
    const out: {
      _id: Id<'docs'>
      _score: number
      chunkSeq: number
      filename: string
      scope: 'mine' | 'shared'
      snippet: string
    }[] = []
    for (const h of top) {
      const row = byId.get(h._id)
      if (row)
        out.push({
          _id: h._id,
          _score: h._score,
          chunkSeq: 0,
          filename: row.filename,
          scope: row.scope,
          snippet: row.snippet
        })
    }
    return out
  }
})
export { action }
