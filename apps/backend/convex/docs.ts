/** biome-ignore-all lint/nursery/noPlaywrightUselessAwait: Convex .first() is thenable */
import { v } from 'convex/values'
import type { Id } from './_generated/dataModel'
import { internal } from './_generated/api'
import { action, internalMutation, internalQuery, query } from './_generated/server'
import { requireOwnerEmail } from './authHelpers'
interface DocRow {
  _id: Id<'docs'>
  filename: string
  uploadedAt: number
  version?: number
}
const findBySha256 = internalQuery({
  args: { owner: v.optional(v.string()), scope: v.union(v.literal('shared'), v.literal('mine')), sha256: v.string() },
  handler: async (ctx, { sha256, scope, owner }): Promise<DocRow | null> => {
    const row = await ctx.db
      .query('docs')
      .withIndex('by_sha256_scope_owner', q =>
        owner === undefined
          ? q.eq('sha256', sha256).eq('scope', scope)
          : q.eq('sha256', sha256).eq('scope', scope).eq('owner', owner)
      )
      .filter(q => q.eq(q.field('deletedAt'), undefined))
      .first()
    return row ? { _id: row._id, filename: row.filename, uploadedAt: row.uploadedAt, version: row.version } : null
  }
})
const findByFilename = internalQuery({
  args: { filename: v.string(), owner: v.optional(v.string()), scope: v.union(v.literal('shared'), v.literal('mine')) },
  handler: async (ctx, { filename, scope, owner }): Promise<DocRow | null> => {
    const row = await ctx.db
      .query('docs')
      .withIndex('by_filename_scope_owner', q =>
        owner === undefined
          ? q.eq('filename', filename).eq('scope', scope)
          : q.eq('filename', filename).eq('scope', scope).eq('owner', owner)
      )
      .filter(q => q.and(q.eq(q.field('deletedAt'), undefined), q.eq(q.field('supersededBy'), undefined)))
      .first()
    return row ? { _id: row._id, filename: row.filename, uploadedAt: row.uploadedAt, version: row.version } : null
  }
})
const insertRow = internalMutation({
  args: {
    fileSize: v.number(),
    filename: v.string(),
    mime: v.string(),
    owner: v.optional(v.string()),
    scope: v.union(v.literal('shared'), v.literal('mine')),
    sha256: v.string(),
    storageId: v.id('_storage'),
    supersedes: v.optional(v.id('docs')),
    uploadedBy: v.string(),
    version: v.number()
  },
  handler: async (ctx, args): Promise<Id<'docs'>> => {
    const id = await ctx.db.insert('docs', {
      fileSize: args.fileSize,
      filename: args.filename,
      mime: args.mime,
      owner: args.owner,
      policyStatus: 'pending',
      scanStatus: 'clean',
      scope: args.scope,
      sha256: args.sha256,
      storageId: args.storageId,
      supersedes: args.supersedes,
      uploadedAt: Date.now(),
      uploadedBy: args.uploadedBy,
      version: args.version
    })
    if (args.supersedes) {
      const prev = await ctx.db.get(args.supersedes)
      if (prev) await ctx.db.patch(args.supersedes, { deletedAt: Date.now(), supersededBy: id })
    }
    await ctx.scheduler.runAfter(0, internal.docsExtract.extract, { docId: id })
    return id
  }
})
const insertQuarantined = internalMutation({
  args: {
    fileSize: v.number(),
    filename: v.string(),
    mime: v.string(),
    owner: v.optional(v.string()),
    scope: v.union(v.literal('shared'), v.literal('mine')),
    sha256: v.string(),
    signature: v.string(),
    uploadedBy: v.string()
  },
  handler: async (ctx, args): Promise<Id<'docs'>> =>
    ctx.db.insert('docs', {
      fileSize: args.fileSize,
      filename: args.filename,
      mime: args.mime,
      owner: args.owner,
      policyStatus: 'pending',
      scanOverrideSignature: args.signature,
      scanStatus: 'quarantined',
      scope: args.scope,
      sha256: args.sha256,
      uploadedAt: Date.now(),
      uploadedBy: args.uploadedBy,
      version: 1
    })
})
interface ExtractTarget {
  filename: string
  mime: string
  storageId: Id<'_storage'>
}
const getForExtract = internalQuery({
  args: { docId: v.id('docs') },
  handler: async (ctx, { docId }): Promise<ExtractTarget | null> => {
    const row = await ctx.db.get(docId)
    if (!row?.storageId) return null
    return { filename: row.filename, mime: row.mime, storageId: row.storageId }
  }
})
const setExtracted = internalMutation({
  args: { docId: v.id('docs'), extractedText: v.string(), lang: v.optional(v.string()) },
  handler: async (ctx, { docId, extractedText, lang }): Promise<void> => {
    await ctx.db.patch(docId, { extractedText, lang })
    await ctx.scheduler.runAfter(0, internal.docsPolicy.classify, { docId })
  }
})
interface ClassifyDoc {
  extractedText?: string
  filename: string
  policyStatus: 'approved' | 'pending' | 'rejected'
}
const getForEmbed = internalQuery({
  args: { docId: v.id('docs') },
  handler: async (ctx, { docId }): Promise<null | { extractedText: string; policyStatus: string }> => {
    const row = await ctx.db.get(docId)
    if (!row?.extractedText) return null
    return { extractedText: row.extractedText, policyStatus: row.policyStatus }
  }
})
const persistChunks = internalMutation({
  args: {
    centroid: v.array(v.float64()),
    chunks: v.array(
      v.object({
        embedding: v.array(v.float64()),
        end: v.number(),
        start: v.number(),
        text: v.string()
      })
    ),
    docId: v.id('docs')
  },
  handler: async (ctx, { docId, chunks, centroid: c }): Promise<void> => {
    const existing = await ctx.db
      .query('docChunks')
      .withIndex('by_doc', q => q.eq('docId', docId))
      .collect()
    for (const e of existing) await ctx.db.delete(e._id)
    for (let i = 0; i < chunks.length; i += 1) {
      const ch = chunks[i]
      if (!ch) continue
      await ctx.db.insert('docChunks', {
        docId,
        embedding: ch.embedding,
        end: ch.end,
        seq: i,
        start: ch.start,
        text: ch.text
      })
    }
    await ctx.db.patch(docId, { embedding: c })
  }
})
interface RowSnippet {
  _id: Id<'docs'>
  filename: string
  scope: 'mine' | 'shared'
  snippet: string
}
const getRowsSnippet = internalQuery({
  args: { ids: v.array(v.id('docs')) },
  handler: async (ctx, { ids }): Promise<RowSnippet[]> => {
    const out: RowSnippet[] = []
    for (const id of ids) {
      const row = await ctx.db.get(id)
      if (row)
        out.push({
          _id: row._id,
          filename: row.filename,
          scope: row.scope,
          snippet: (row.extractedText ?? '').slice(0, 160)
        })
    }
    return out
  }
})
const getForClassify = internalQuery({
  args: { docId: v.id('docs') },
  handler: async (ctx, { docId }): Promise<ClassifyDoc | null> => {
    const row = await ctx.db.get(docId)
    if (!row) return null
    return { extractedText: row.extractedText, filename: row.filename, policyStatus: row.policyStatus }
  }
})
const setPolicy = internalMutation({
  args: {
    docId: v.id('docs'),
    policyCategory: v.union(
      v.literal('on-topic'),
      v.literal('off-topic'),
      v.literal('spam'),
      v.literal('prompt-injection'),
      v.literal('abusive'),
      v.literal('promotional')
    ),
    policyReason: v.string(),
    policyStatus: v.union(v.literal('approved'), v.literal('rejected'))
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.patch(args.docId, {
      policyCategory: args.policyCategory,
      policyReason: args.policyReason,
      policyStatus: args.policyStatus
    })
    if (args.policyStatus === 'approved') await ctx.scheduler.runAfter(0, internal.docsEmbed.embed, { docId: args.docId })
  }
})
interface UploadResult {
  docId?: Id<'docs'>
  duplicate?: { existingId: Id<'docs'>; filename: string; uploadedAt: number }
  filenameConflict?: { existingId: Id<'docs'>; filename: string }
  ok: boolean
  reason?: string
  signature?: string
}
const upload = action({
  args: {
    filename: v.string(),
    mime: v.string(),
    replace: v.optional(v.boolean()),
    scope: v.union(v.literal('shared'), v.literal('mine')),
    storageId: v.id('_storage')
  },
  handler: async (ctx, args): Promise<UploadResult> => {
    const uploaderEmail = await requireOwnerEmail(ctx)
    return ctx.runAction(internal.docsUpload.finalize, { ...args, uploaderEmail })
  }
})
interface DocListItem {
  _id: Id<'docs'>
  filename: string
  fileSize: number
  mime: string
  policyStatus: 'approved' | 'pending' | 'rejected'
  scanStatus: 'clean' | 'pending' | 'quarantined'
  scope: 'mine' | 'shared'
  uploadedAt: number
  version: number
}
const listMine = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }): Promise<DocListItem[]> => {
    const email = await requireOwnerEmail(ctx)
    const rows = await ctx.db
      .query('docs')
      .withIndex('by_scope_uploadedAt', q => q.eq('scope', 'mine'))
      .filter(q => q.and(q.eq(q.field('owner'), email), q.eq(q.field('deletedAt'), undefined)))
      .order('desc')
      .take(limit ?? 50)
    return rows.map(r => ({
      _id: r._id,
      fileSize: r.fileSize,
      filename: r.filename,
      mime: r.mime,
      policyStatus: r.policyStatus,
      scanStatus: r.scanStatus,
      scope: r.scope,
      uploadedAt: r.uploadedAt,
      version: r.version
    }))
  }
})
const listShared = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }): Promise<DocListItem[]> => {
    await requireOwnerEmail(ctx)
    const rows = await ctx.db
      .query('docs')
      .withIndex('by_scope_uploadedAt', q => q.eq('scope', 'shared'))
      .filter(q => q.eq(q.field('deletedAt'), undefined))
      .order('desc')
      .take(limit ?? 50)
    return rows.map(r => ({
      _id: r._id,
      fileSize: r.fileSize,
      filename: r.filename,
      mime: r.mime,
      policyStatus: r.policyStatus,
      scanStatus: r.scanStatus,
      scope: r.scope,
      uploadedAt: r.uploadedAt,
      version: r.version
    }))
  }
})
export {
  findByFilename,
  findBySha256,
  getForClassify,
  getForEmbed,
  getForExtract,
  getRowsSnippet,
  insertQuarantined,
  insertRow,
  listMine,
  listShared,
  persistChunks,
  setExtracted,
  setPolicy,
  upload
}
export type { DocListItem, DocRow, ExtractTarget, RowSnippet, UploadResult }
