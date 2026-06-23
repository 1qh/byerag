/** biome-ignore-all lint/performance/noAwaitInLoops: sequential Convex DB deletes */
/* eslint-disable no-await-in-loop */
import { v } from 'convex/values'
import { internal } from './_generated/api'
import { internalMutation, internalQuery } from './_generated/server'

const SANDBOX_TTL_MS = 24 * 60 * 60 * 1000
const STALE_REPLACE_MS = 60 * 60 * 1000
const lastActivity = (row: { _creationTime: number; lastUsedAt?: number }): number => row.lastUsedAt ?? row._creationTime
const getByOwner = internalQuery({
  args: { owner: v.string() },
  handler: async (ctx, { owner }) =>
    ctx.db
      .query('sandboxes')
      .withIndex('by_owner', q => q.eq('owner', owner))
      .first()
})
const upsert = internalMutation({
  args: {
    owner: v.string(),
    sandboxId: v.string()
  },
  handler: async (ctx, { owner, sandboxId }): Promise<{ accepted: boolean; existingSandboxId?: string }> => {
    const now = Date.now()
    const existing = await ctx.db
      .query('sandboxes')
      .withIndex('by_owner', q => q.eq('owner', owner))
      .take(10)
    if (existing.length === 0) {
      await ctx.db.insert('sandboxes', { lastUsedAt: now, owner, sandboxId })
      return { accepted: true }
    }
    const [keep, ...dupes] = existing
    if (!keep) return { accepted: false }
    for (const d of dupes) {
      await ctx.scheduler.runAfter(0, internal.sandboxKill.killOnly, { sandboxId: d.sandboxId })
      await ctx.db.delete(d._id)
    }
    if (keep.sandboxId !== sandboxId) {
      const stale = lastActivity(keep) + STALE_REPLACE_MS < now
      if (stale) {
        await ctx.scheduler.runAfter(0, internal.sandboxKill.killOnly, { sandboxId: keep.sandboxId })
        await ctx.db.patch(keep._id, { lastUsedAt: now, sandboxId })
        return { accepted: true }
      }
      await ctx.scheduler.runAfter(0, internal.sandboxKill.killOnly, { sandboxId })
      await ctx.db.patch(keep._id, { lastUsedAt: now })
      return { accepted: false, existingSandboxId: keep.sandboxId }
    }
    await ctx.db.patch(keep._id, { lastUsedAt: now, sandboxId })
    return { accepted: true }
  },
  // oxlint-disable-next-line unicorn/max-nested-calls
  returns: v.object({ accepted: v.boolean(), existingSandboxId: v.optional(v.string()) })
})
const touch = internalMutation({
  args: { owner: v.string() },
  handler: async (ctx, { owner }) => {
    // biome-ignore lint/nursery/noPlaywrightUselessAwait: Convex .first() returns thenable
    const existing = await ctx.db
      .query('sandboxes')
      .withIndex('by_owner', q => q.eq('owner', owner))
      .first()
    if (existing) await ctx.db.patch(existing._id, { lastUsedAt: Date.now() })
  }
})
const remove = internalMutation({
  args: { owner: v.string(), sandboxId: v.optional(v.string()) },
  handler: async (ctx, { owner, sandboxId }) => {
    // biome-ignore lint/nursery/noPlaywrightUselessAwait: Convex .first() returns thenable
    const existing = await ctx.db
      .query('sandboxes')
      .withIndex('by_owner', q => q.eq('owner', owner))
      .first()
    if (!existing) return
    if (sandboxId !== undefined && existing.sandboxId !== sandboxId) return
    await ctx.db.delete(existing._id)
  }
})
const listStale = internalQuery({
  args: {},
  handler: async ctx => {
    const cutoff = Date.now() - SANDBOX_TTL_MS
    const stale = await ctx.db
      .query('sandboxes')
      .withIndex('by_lastUsedAt', q => q.lt('lastUsedAt', cutoff))
      .take(500)
    return stale.map(r => ({ owner: r.owner, sandboxId: r.sandboxId }))
  }
})
export { getByOwner, listStale, remove, touch, upsert }
