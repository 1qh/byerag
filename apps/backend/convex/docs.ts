/* eslint-disable no-await-in-loop, no-continue, unicorn/prefer-ternary, unicorn/no-new-array, unicorn/prefer-array-find */
/** biome-ignore-all lint/nursery/noContinue: control flow shape */
/** biome-ignore-all lint/nursery/noShadow: scoped shadows ok */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential by design */
/** biome-ignore-all lint/performance/useTopLevelRegex: scoped regex ok */
/** biome-ignore-all lint/style/useExplicitLengthCheck: idiomatic */
/** biome-ignore-all lint/correctness/noUnusedVariables: pending feature */
/** biome-ignore-all lint/nursery/noPlaywrightUselessAwait: Convex .first() is thenable */
import { v } from 'convex/values'
import type { Id } from './_generated/dataModel'
import { internal } from './_generated/api'
import { action, internalMutation, internalQuery, mutation, query } from './_generated/server'
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
      .filter(q => q.and(q.eq(q.field('deletedAt'), undefined), q.neq(q.field('scanStatus'), 'quarantined')))
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
    storageId: v.optional(v.id('_storage')),
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
      storageId: args.storageId,
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
  uploadedBy: string
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
interface ChunkRow {
  _id: Id<'docChunks'>
  docId: Id<'docs'>
  seq: number
  text: string
}
const countRecentQuarantines = internalQuery({
  args: { sha256: v.string(), sinceMs: v.number(), uploadedBy: v.string() },
  handler: async (ctx, { sha256, uploadedBy, sinceMs }): Promise<number> => {
    const cutoff = Date.now() - sinceMs
    const rows = await ctx.db
      .query('docs')
      .filter(q =>
        q.and(
          q.eq(q.field('sha256'), sha256),
          q.eq(q.field('uploadedBy'), uploadedBy),
          q.eq(q.field('scanStatus'), 'quarantined'),
          q.gte(q.field('uploadedAt'), cutoff)
        )
      )
      .collect()
    return rows.length
  }
})
const getChunkRows = internalQuery({
  args: { ids: v.array(v.id('docChunks')) },
  handler: async (ctx, { ids }): Promise<ChunkRow[]> => {
    const out: ChunkRow[] = []
    for (const id of ids) {
      const row = await ctx.db.get(id)
      if (row) out.push({ _id: row._id, docId: row.docId, seq: row.seq, text: row.text })
    }
    return out
  }
})
interface ConflictDoc {
  _id: Id<'docs'>
  extractedText: string
  filename: string
  owner?: string
  scope: 'mine' | 'shared'
}
const getForConflict = internalQuery({
  args: { docId: v.id('docs') },
  handler: async (ctx, { docId }): Promise<ConflictDoc | null> => {
    const row = await ctx.db.get(docId)
    if (!row?.extractedText) return null
    return { _id: row._id, extractedText: row.extractedText, filename: row.filename, owner: row.owner, scope: row.scope }
  }
})
const getForClassify = internalQuery({
  args: { docId: v.id('docs') },
  handler: async (ctx, { docId }): Promise<ClassifyDoc | null> => {
    const row = await ctx.db.get(docId)
    if (!row) return null
    return {
      extractedText: row.extractedText,
      filename: row.filename,
      policyStatus: row.policyStatus,
      uploadedBy: row.uploadedBy
    }
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
    if (args.policyStatus === 'approved') {
      await ctx.scheduler.runAfter(0, internal.docsEmbed.embed, { docId: args.docId })
      await ctx.scheduler.runAfter(0, internal.trainingGen.generate, { docId: args.docId })
    }
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
    keepBoth: v.optional(v.boolean()),
    mime: v.string(),
    replace: v.optional(v.boolean()),
    scope: v.union(v.literal('shared'), v.literal('mine')),
    storageId: v.id('_storage')
  },
  handler: async (ctx, args): Promise<UploadResult> => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity?.email) throw new Error('not authenticated')
    const uploaderEmail = identity.email.toLowerCase()
    return ctx.runAction(internal.docsUpload.finalize, { ...args, uploaderEmail })
  }
})
const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx): Promise<string> => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity?.email) throw new Error('not authenticated')
    return ctx.storage.generateUploadUrl()
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
const getCitationBadge = query({
  args: { docId: v.id('docs') },
  handler: async (
    ctx,
    { docId }
  ): Promise<null | {
    badge: 'deleted' | 'fresh' | 'superseded'
    filename: string
    supersededBy?: string
    version: number
  }> => {
    const row = await ctx.db.get(docId)
    if (!row) return null
    const badge: 'deleted' | 'fresh' | 'superseded' = row.deletedAt ? 'deleted' : row.supersededBy ? 'superseded' : 'fresh'
    return { badge, filename: row.filename, supersededBy: row.supersededBy, version: row.version }
  }
})
const adminDeleteDoc = mutation({
  args: { docId: v.id('docs') },
  handler: async (ctx, { docId }): Promise<{ pendingSuggestionsCancelled: number; questionsSoftDeleted: number }> => {
    const identity = await ctx.auth.getUserIdentity()
    const email = identity?.email?.toLowerCase()
    if (!email) throw new Error('not authenticated')
    const profileRows = await ctx.db
      .query('userProfiles')
      .withIndex('by_userId', q => q.eq('userId', email))
      .collect()
    const profile = profileRows[0]
    if (profile?.role !== 'admin') throw new Error('admin only')
    const doc = await ctx.db.get(docId)
    if (!doc) throw new Error('doc not found')
    await ctx.db.patch(docId, { deletedAt: Date.now() })
    const pendingSuggestions = await ctx.db
      .query('testQuestionSuggestions')
      .filter(q => q.eq(q.field('status'), 'pending'))
      .take(500)
    let pendingSuggestionsCancelled = 0
    for (const s of pendingSuggestions)
      if (s.sourceDocIds.includes(docId)) {
        await ctx.db.patch(s._id, {
          resolvedAction: 'auto-rejected',
          resolvedAt: Date.now(),
          resolvedBy: email,
          resolvedReason: 'source-doc-deleted',
          status: 'resolved'
        })
        pendingSuggestionsCancelled += 1
      }
    const questions = await ctx.db.query('testQuestions').take(2000)
    let questionsSoftDeleted = 0
    for (const q of questions)
      if (!q.deletedAt && q.sourceDocIds.includes(docId)) {
        await ctx.db.patch(q._id, { deleteReason: 'source-doc-cascade', deletedAt: Date.now() })
        questionsSoftDeleted += 1
      }
    await ctx.db.insert('auditLogs', {
      args: JSON.stringify({ docId, filename: doc.filename, pendingSuggestionsCancelled, questionsSoftDeleted }),
      command: 'docs.adminDelete',
      mode: 'session',
      ok: true,
      owner: email,
      severity: 'medium'
    })
    return { pendingSuggestionsCancelled, questionsSoftDeleted }
  }
})
const requestReview = mutation({
  args: { docId: v.id('docs') },
  handler: async (ctx, { docId }): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity()
    const email = identity?.email?.toLowerCase()
    if (!email) throw new Error('not authenticated')
    const doc = await ctx.db.get(docId)
    if (!doc) throw new Error('doc not found')
    if (doc.uploadedBy !== email) throw new Error('only uploader can request review')
    if (doc.policyStatus !== 'rejected') throw new Error('only rejected docs can request review')
    const last = doc.policyReviewRequestedAt ?? 0
    if (Date.now() - last < 86_400_000) throw new Error('review already requested today; try again in 24h')
    await ctx.db.patch(docId, { policyReviewRequestedAt: Date.now() })
    await ctx.db.insert('auditLogs', {
      args: JSON.stringify({ docId, filename: doc.filename }),
      command: 'docs.requestReview',
      mode: 'session',
      ok: true,
      owner: email,
      severity: 'low'
    })
  }
})
const adminApproveReview = mutation({
  args: { docId: v.id('docs') },
  handler: async (ctx, { docId }): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity()
    const email = identity?.email?.toLowerCase()
    if (!email) throw new Error('not authenticated')
    const profile = await ctx.db
      .query('userProfiles')
      .withIndex('by_userId', q => q.eq('userId', email))
      .first()
    if (profile?.role !== 'admin') throw new Error('admin only')
    const doc = await ctx.db.get(docId)
    if (!doc) throw new Error('doc not found')
    await ctx.db.patch(docId, { policyOverriddenBy: email, policyStatus: 'approved' })
    await ctx.scheduler.runAfter(0, internal.docsEmbed.embed, { docId })
    await ctx.scheduler.runAfter(0, internal.trainingGen.generate, { docId })
    await ctx.db.insert('auditLogs', {
      args: JSON.stringify({ docId, filename: doc.filename }),
      command: 'docs.policyOverride.approve',
      mode: 'session',
      ok: true,
      owner: email,
      severity: 'medium'
    })
  }
})
const adminConfirmReject = mutation({
  args: { docId: v.id('docs') },
  handler: async (ctx, { docId }): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity()
    const email = identity?.email?.toLowerCase()
    if (!email) throw new Error('not authenticated')
    const profile = await ctx.db
      .query('userProfiles')
      .withIndex('by_userId', q => q.eq('userId', email))
      .first()
    if (profile?.role !== 'admin') throw new Error('admin only')
    const doc = await ctx.db.get(docId)
    if (!doc) throw new Error('doc not found')
    if (doc.storageId) {
      try {
        await ctx.storage.delete(doc.storageId)
      } catch {
        // Already gone
      }
      await ctx.db.patch(docId, { policyOverriddenBy: email, storageId: undefined })
    }
    await ctx.db.insert('auditLogs', {
      args: JSON.stringify({ docId, filename: doc.filename }),
      command: 'docs.policyOverride.confirmReject',
      mode: 'session',
      ok: true,
      owner: email,
      severity: 'medium'
    })
  }
})
const adminScanOverride = mutation({
  args: { docId: v.id('docs') },
  handler: async (ctx, { docId }): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity()
    const email = identity?.email?.toLowerCase()
    if (!email) throw new Error('not authenticated')
    const profile = await ctx.db
      .query('userProfiles')
      .withIndex('by_userId', q => q.eq('userId', email))
      .first()
    if (profile?.role !== 'admin') throw new Error('admin only')
    const doc = await ctx.db.get(docId)
    if (!doc) throw new Error('doc not found')
    if (doc.scanStatus !== 'quarantined') throw new Error('not quarantined')
    if (!doc.storageId) throw new Error('staging blob already purged')
    await ctx.db.patch(docId, {
      scanOverriddenAt: Date.now(),
      scanOverriddenBy: email,
      scanStatus: 'clean'
    })
    await ctx.scheduler.runAfter(0, internal.docsExtract.extract, { docId })
    await ctx.db.insert('auditLogs', {
      args: JSON.stringify({ docId, filename: doc.filename, signature: doc.scanOverrideSignature }),
      command: 'docs.scanOverride',
      mode: 'session',
      ok: true,
      owner: email,
      severity: 'high'
    })
  }
})
const adminScanCancel = mutation({
  args: { docId: v.id('docs') },
  handler: async (ctx, { docId }): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity()
    const email = identity?.email?.toLowerCase()
    if (!email) throw new Error('not authenticated')
    const profile = await ctx.db
      .query('userProfiles')
      .withIndex('by_userId', q => q.eq('userId', email))
      .first()
    if (profile?.role !== 'admin') throw new Error('admin only')
    const doc = await ctx.db.get(docId)
    if (!doc) throw new Error('doc not found')
    if (doc.storageId)
      try {
        await ctx.storage.delete(doc.storageId)
      } catch {
        // Already gone
      }
    await ctx.db.patch(docId, { scanCancelledAt: Date.now(), storageId: undefined })
    await ctx.db.insert('auditLogs', {
      args: JSON.stringify({ docId, filename: doc.filename }),
      command: 'docs.scanCancel',
      mode: 'session',
      ok: true,
      owner: email,
      severity: 'medium'
    })
  }
})
const listForQuarantine = query({
  args: {},
  handler: async ctx => {
    const identity = await ctx.auth.getUserIdentity()
    const email = identity?.email?.toLowerCase()
    if (!email) return []
    // biome-ignore lint/nursery/noPlaywrightUselessAwait: Convex .first() returns thenable
    const profile = await ctx.db
      .query('userProfiles')
      .withIndex('by_userId', q => q.eq('userId', email))
      .first()
    if (profile?.role !== 'admin') return []
    const rejected = await ctx.db
      .query('docs')
      .withIndex('by_policyStatus', q => q.eq('policyStatus', 'rejected'))
      .filter(q => q.eq(q.field('deletedAt'), undefined))
      .take(200)
    const quarantined = await ctx.db
      .query('docs')
      .filter(q => q.and(q.eq(q.field('scanStatus'), 'quarantined'), q.eq(q.field('deletedAt'), undefined)))
      .take(200)
    return [...rejected, ...quarantined].map(r => ({
      _id: r._id,
      filename: r.filename,
      owner: r.owner,
      policyCategory: r.policyCategory,
      policyReason: r.policyReason,
      policyStatus: r.policyStatus,
      scanOverrideSignature: r.scanOverrideSignature,
      scanStatus: r.scanStatus,
      uploadedAt: r.uploadedAt
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
const PURGE_TTL_MS = 30 * 24 * 60 * 60 * 1000
const markClassifierError = internalMutation({
  args: { docId: v.id('docs'), reason: v.string() },
  handler: async (ctx, { docId, reason }): Promise<void> => {
    const doc = await ctx.db.get(docId)
    if (!doc) return
    await ctx.db.patch(docId, { policyReason: reason })
    await ctx.db.insert('auditLogs', {
      args: JSON.stringify({ docId, filename: doc.filename, reason }),
      command: 'docs.classifierError',
      mode: 'system',
      ok: false,
      owner: doc.uploadedBy,
      severity: 'medium'
    })
  }
})
const purgeQuarantineStaging = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ blobsPurged: number; rowsTouched: number }> => {
    const cutoff = Date.now() - 3_600_000
    const candidates = await ctx.db
      .query('docs')
      .withIndex('by_policyStatus')
      .filter(q =>
        q.and(
          q.eq(q.field('scanStatus'), 'quarantined'),
          q.eq(q.field('scanOverriddenAt'), undefined),
          q.neq(q.field('storageId'), undefined),
          q.lt(q.field('uploadedAt'), cutoff)
        )
      )
      .take(200)
    let blobsPurged = 0
    let rowsTouched = 0
    for (const doc of candidates) {
      if (doc.storageId)
        try {
          await ctx.storage.delete(doc.storageId)
          blobsPurged += 1
        } catch {
          // Already gone
        }
      await ctx.db.patch(doc._id, { scanCancelledAt: Date.now(), storageId: undefined })
      rowsTouched += 1
    }
    return { blobsPurged, rowsTouched }
  }
})
const purgeSoftDeleted = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ blobsPurged: number; chunksPurged: number }> => {
    const cutoff = Date.now() - PURGE_TTL_MS
    const candidates = await ctx.db
      .query('docs')
      .withIndex('by_deletedAt')
      .filter(q => q.and(q.neq(q.field('deletedAt'), undefined), q.lt(q.field('deletedAt'), cutoff)))
      .take(200)
    let blobsPurged = 0
    let chunksPurged = 0
    for (const doc of candidates) {
      if (doc.storageId) {
        try {
          await ctx.storage.delete(doc.storageId)
          blobsPurged += 1
        } catch {
          // Already gone
        }
        await ctx.db.patch(doc._id, { storageId: undefined })
      }
      const chunks = await ctx.db
        .query('docChunks')
        .withIndex('by_doc', q => q.eq('docId', doc._id))
        .take(500)
      for (const c of chunks) {
        await ctx.db.delete(c._id)
        chunksPurged += 1
      }
    }
    return { blobsPurged, chunksPurged }
  }
})
export {
  adminApproveReview,
  adminConfirmReject,
  adminDeleteDoc,
  adminScanCancel,
  adminScanOverride,
  countRecentQuarantines,
  findByFilename,
  findBySha256,
  generateUploadUrl,
  getChunkRows,
  getCitationBadge,
  getForClassify,
  getForConflict,
  getForEmbed,
  getForExtract,
  getRowsSnippet,
  insertQuarantined,
  insertRow,
  listForQuarantine,
  listMine,
  listShared,
  markClassifierError,
  persistChunks,
  purgeQuarantineStaging,
  purgeSoftDeleted,
  requestReview,
  setExtracted,
  setPolicy,
  upload
}
export type { ConflictDoc, DocListItem, DocRow, ExtractTarget, RowSnippet, UploadResult }
