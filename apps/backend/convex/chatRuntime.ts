import { v } from 'convex/values'
import type { Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { internalMutation } from './_generated/server'
const STREAM_EVENT_HARD_CAP = 5000
const PROXY_CALLS_PER_TURN_CAP = 200
const getRuntime = async (ctx: MutationCtx | QueryCtx, chatId: Id<'chats'>) =>
  ctx.db
    .query('chatRuntime')
    .withIndex('by_chat', q => q.eq('chatId', chatId))
    .unique()
const createRuntime = async (ctx: MutationCtx, chatId: Id<'chats'>): Promise<void> => {
  await ctx.db.insert('chatRuntime', { chatId, streamEventCount: 0 })
}
const incrementEventCount = async (ctx: MutationCtx, chatId: Id<'chats'>): Promise<number> => {
  const rt = await getRuntime(ctx, chatId)
  if (!rt) throw new Error('chatRuntime missing')
  if (rt.streamEventCount >= STREAM_EVENT_HARD_CAP) throw new Error('too many events')
  const next = rt.streamEventCount + 1
  await ctx.db.patch(rt._id, { streamEventCount: next })
  return next
}
const resetEventCount = async (ctx: MutationCtx, chatId: Id<'chats'>): Promise<void> => {
  const rt = await getRuntime(ctx, chatId)
  await (rt
    ? ctx.db.patch(rt._id, { streamEventCount: 0 })
    : ctx.db.insert('chatRuntime', { chatId, streamEventCount: 0 }))
}
const resetTurn = async (ctx: MutationCtx, chatId: Id<'chats'>): Promise<void> => {
  const rt = await getRuntime(ctx, chatId)
  await (rt
    ? ctx.db.patch(rt._id, { proxyCallsThisTurn: 0, streamEventCount: 0 })
    : ctx.db.insert('chatRuntime', { chatId, proxyCallsThisTurn: 0, streamEventCount: 0 }))
}
const incrementProxyCalls = async (ctx: MutationCtx, chatId: Id<'chats'>): Promise<number> => {
  const rt = await getRuntime(ctx, chatId)
  if (!rt) throw new Error('chatRuntime missing')
  const current = rt.proxyCallsThisTurn ?? 0
  if (current >= PROXY_CALLS_PER_TURN_CAP) throw new Error('proxy turn budget exhausted')
  const next = current + 1
  await ctx.db.patch(rt._id, { proxyCallsThisTurn: next })
  return next
}
const deleteRuntime = async (ctx: MutationCtx, chatId: Id<'chats'>): Promise<void> => {
  const rt = await getRuntime(ctx, chatId)
  if (rt) await ctx.db.delete(rt._id)
}
const consumeProxyCallBudget = internalMutation({
  args: { chatId: v.id('chats') },
  handler: async (ctx, { chatId }): Promise<boolean> => {
    try {
      await incrementProxyCalls(ctx, chatId)
      return true
    } catch {
      return false
    }
  },
  returns: v.boolean()
})
export {
  consumeProxyCallBudget,
  createRuntime,
  deleteRuntime,
  incrementEventCount,
  incrementProxyCalls,
  PROXY_CALLS_PER_TURN_CAP,
  resetEventCount,
  resetTurn,
  STREAM_EVENT_HARD_CAP
}
