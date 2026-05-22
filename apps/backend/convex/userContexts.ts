import { v } from 'convex/values'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { internalMutation, internalQuery, query } from './_generated/server'
import { getOwnerEmailOrNull } from './authHelpers'

const findByUser = async (ctx: MutationCtx | QueryCtx, userId: string) =>
  ctx.db
    .query('userContexts')
    .withIndex('by_user', q => q.eq('userId', userId))
    .first()
const getByUser = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => findByUser(ctx, userId)
})
const setBusy = internalMutation({
  args: {
    busyChatId: v.optional(v.id('chats')),
    busyKind: v.union(v.literal('agent'), v.literal('pipeline')),
    busyUntil: v.number(),
    userId: v.string()
  },
  handler: async (ctx, { busyChatId, busyKind, busyUntil, userId }) => {
    const existing = await findByUser(ctx, userId)
    if (existing) {
      await ctx.db.patch(existing._id, { busyChatId, busyKind, busyUntil })
      return existing._id
    }
    return ctx.db.insert('userContexts', { busyChatId, busyKind, busyUntil, userId })
  }
})
const clearBusy = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const existing = await findByUser(ctx, userId)
    if (!existing) return false
    await ctx.db.patch(existing._id, { busyChatId: undefined, busyKind: undefined, busyUntil: undefined })
    return true
  }
})
const claimContext = internalMutation({
  args: { token: v.string(), userId: v.string() },
  handler: async (ctx, { token, userId }) => {
    const existing = await findByUser(ctx, userId)
    const now = Date.now()
    if (existing) {
      await ctx.db.patch(existing._id, { activeContextHeartbeatAt: now, activeContextToken: token })
      return existing._id
    }
    return ctx.db.insert('userContexts', {
      activeContextHeartbeatAt: now,
      activeContextToken: token,
      userId
    })
  }
})
const heartbeat = internalMutation({
  args: { token: v.string(), userId: v.string() },
  handler: async (ctx, { token, userId }) => {
    const existing = await findByUser(ctx, userId)
    if (existing?.activeContextToken !== token) return false
    await ctx.db.patch(existing._id, { activeContextHeartbeatAt: Date.now() })
    return true
  }
})
interface MyContextResult {
  activeContextToken: null | string
  busyChatId: null | string
  busyKind: 'agent' | 'pipeline' | null
  busyUntil: null | number
}
const myContext = query({
  args: {},
  handler: async (ctx): Promise<MyContextResult> => {
    const userId = await getOwnerEmailOrNull(ctx)
    if (!userId) return { activeContextToken: null, busyChatId: null, busyKind: null, busyUntil: null }
    const row = await findByUser(ctx, userId)
    if (!row) return { activeContextToken: null, busyChatId: null, busyKind: null, busyUntil: null }
    return {
      activeContextToken: row.activeContextToken ?? null,
      busyChatId: row.busyChatId ?? null,
      busyKind: row.busyKind ?? null,
      busyUntil: row.busyUntil ?? null
    }
  }
})
export { claimContext, clearBusy, getByUser, heartbeat, myContext, setBusy }
