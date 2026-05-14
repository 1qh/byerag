/** biome-ignore-all lint/nursery/noPlaywrightUselessAwait: Convex .first() is thenable */
import { v } from 'convex/values'
import type { Id } from './_generated/dataModel'
import { internalMutation, internalQuery } from './_generated/server'
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
export { findByFilename, findBySha256, insertQuarantined, insertRow }
export type { DocRow }
