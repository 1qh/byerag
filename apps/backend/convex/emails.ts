import { v } from 'convex/values'
import type { Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { internalMutation, internalQuery } from './_generated/server'
const findByPgId = async (ctx: MutationCtx | QueryCtx, pgEmailId: string) =>
  ctx.db
    .query('emails')
    .withIndex('by_pgEmailId', q => q.eq('pgEmailId', pgEmailId))
    .first()
const emailStatus = v.union(
  v.literal('queued'),
  v.literal('sent'),
  v.literal('delivered'),
  v.literal('opened'),
  v.literal('clicked'),
  v.literal('bounced'),
  v.literal('replied'),
  v.literal('failed')
)
const insert = internalMutation({
  args: {
    attachmentIds: v.array(v.id('_storage')),
    campaignId: v.optional(v.string()),
    collectionId: v.id('collections'),
    companyId: v.id('companies'),
    fromEmail: v.string(),
    pgEmailId: v.string(),
    sentAt: v.number(),
    status: emailStatus,
    subject: v.string(),
    text: v.string(),
    toEmail: v.string(),
    userId: v.string()
  },
  handler: async (ctx, args): Promise<Id<'emails'>> =>
    ctx.db.insert('emails', {
      attachmentIds: args.attachmentIds,
      campaignId: args.campaignId,
      collectionId: args.collectionId,
      companyId: args.companyId,
      fromEmail: args.fromEmail,
      pgEmailId: args.pgEmailId,
      sentAt: args.sentAt,
      status: args.status,
      subject: args.subject,
      text: args.text,
      toEmail: args.toEmail,
      userId: args.userId
    })
})
const findByPgIdQuery = internalQuery({
  args: { pgEmailId: v.string() },
  handler: async (ctx, { pgEmailId }) => findByPgId(ctx, pgEmailId)
})
const updateStatusByPgId = internalMutation({
  args: { pgEmailId: v.string(), status: emailStatus },
  handler: async (ctx, { pgEmailId, status }): Promise<Id<'emails'> | null> => {
    const existing = await findByPgId(ctx, pgEmailId)
    if (!existing) return null
    await ctx.db.patch(existing._id, { status })
    return existing._id
  }
})
const listByCollection = internalQuery({
  args: { collectionId: v.id('collections') },
  handler: async (ctx, { collectionId }) =>
    ctx.db
      .query('emails')
      .withIndex('by_collection', q => q.eq('collectionId', collectionId))
      .order('desc')
      .take(200)
})
const countByUserStatus = internalQuery({
  args: { status: emailStatus, userId: v.string() },
  handler: async (ctx, { status, userId }) =>
    ctx.db
      .query('emails')
      .withIndex('by_user_status', q => q.eq('userId', userId).eq('status', status))
      .collect()
})
export { countByUserStatus, findByPgIdQuery as findByPgId, insert, listByCollection, updateStatusByPgId }
