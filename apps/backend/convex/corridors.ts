import { v } from 'convex/values'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { internalMutation, internalQuery } from './_generated/server'
const findByName = async (ctx: MutationCtx | QueryCtx, userId: string, name: string) =>
  ctx.db
    .query('corridors')
    .withIndex('by_user_name', q => q.eq('userId', userId).eq('name', name))
    .first()
const upsert = internalMutation({
  args: {
    defaultCurrency: v.optional(v.string()),
    defaultIncoterm: v.optional(v.string()),
    exporterCountry: v.string(),
    hsCode: v.string(),
    importerCountry: v.string(),
    name: v.string(),
    star: v.boolean(),
    userId: v.string()
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const existing = await findByName(ctx, args.userId, args.name)
    if (existing) {
      await ctx.db.patch(existing._id, {
        defaultCurrency: args.defaultCurrency,
        defaultIncoterm: args.defaultIncoterm,
        exporterCountry: args.exporterCountry,
        hsCode: args.hsCode,
        importerCountry: args.importerCountry,
        starredAt: args.star ? (existing.starredAt ?? now) : undefined,
        updatedAt: now
      })
      return existing._id
    }
    return ctx.db.insert('corridors', {
      defaultCurrency: args.defaultCurrency,
      defaultIncoterm: args.defaultIncoterm,
      exporterCountry: args.exporterCountry,
      hsCode: args.hsCode,
      importerCountry: args.importerCountry,
      name: args.name,
      starredAt: args.star ? now : undefined,
      updatedAt: now,
      userId: args.userId
    })
  }
})
const listByUser = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) =>
    ctx.db
      .query('corridors')
      .withIndex('by_user', q => q.eq('userId', userId))
      .order('desc')
      .take(50)
})
const getByName = internalQuery({
  args: { name: v.string(), userId: v.string() },
  handler: async (ctx, { name, userId }) => findByName(ctx, userId, name)
})
const removeByName = internalMutation({
  args: { name: v.string(), userId: v.string() },
  handler: async (ctx, { name, userId }) => {
    const row = await findByName(ctx, userId, name)
    if (!row) return false
    await ctx.db.delete(row._id)
    return true
  }
})
export { getByName, listByUser, removeByName, upsert }
