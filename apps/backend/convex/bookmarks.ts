import { v } from 'convex/values'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { internalMutation, internalQuery } from './_generated/server'
const kindValidator = v.union(v.literal('company'), v.literal('contact'), v.literal('chat'), v.literal('corridor'))
interface BookmarkKey {
  kind: 'chat' | 'company' | 'contact' | 'corridor'
  refId: string
  userId: string
}
const findExisting = async (ctx: MutationCtx, key: BookmarkKey) =>
  ctx.db
    .query('bookmarks')
    .withIndex('by_user_ref', q => q.eq('userId', key.userId).eq('kind', key.kind).eq('refId', key.refId))
    .first()
const queryByKind = async (ctx: QueryCtx, userId: string, kind: 'chat' | 'company' | 'contact' | 'corridor') =>
  ctx.db
    .query('bookmarks')
    .withIndex('by_user_kind', q => q.eq('userId', userId).eq('kind', kind))
    .order('desc')
    .take(200)
const queryAll = async (ctx: QueryCtx, userId: string) =>
  ctx.db
    .query('bookmarks')
    .withIndex('by_user', q => q.eq('userId', userId))
    .order('desc')
    .take(200)
const add = internalMutation({
  args: { kind: kindValidator, note: v.optional(v.string()), refId: v.string(), userId: v.string() },
  handler: async (ctx, { kind, note, refId, userId }) => {
    const existing = await findExisting(ctx, { kind, refId, userId })
    if (existing) {
      await ctx.db.patch(existing._id, { note: note ?? existing.note })
      return existing._id
    }
    return ctx.db.insert('bookmarks', { addedAt: Date.now(), kind, note, refId, userId })
  }
})
const remove = internalMutation({
  args: { kind: kindValidator, refId: v.string(), userId: v.string() },
  handler: async (ctx, { kind, refId, userId }) => {
    const existing = await findExisting(ctx, { kind, refId, userId })
    if (!existing) return false
    await ctx.db.delete(existing._id)
    return true
  }
})
const listByUser = internalQuery({
  args: { kind: v.optional(kindValidator), userId: v.string() },
  handler: async (ctx, { kind, userId }) => (kind ? queryByKind(ctx, userId, kind) : queryAll(ctx, userId))
})
export { add, listByUser, remove }
