import { v } from 'convex/values'
import type { Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { internalMutation, mutation } from './_generated/server'
import { requireOwnerEmail } from './authHelpers'
const findExistingVote = async (ctx: MutationCtx, chatId: Id<'chats'>, messageId: Id<'messages'>) =>
  ctx.db
    .query('feedback')
    .withIndex('by_chat_message', q => q.eq('chatId', chatId).eq('messageId', messageId))
    .first()
const vote = internalMutation({
  args: {
    chatId: v.id('chats'),
    isUpvoted: v.boolean(),
    messageId: v.id('messages'),
    userId: v.string()
  },
  handler: async (ctx, args) => {
    const existing = await findExistingVote(ctx, args.chatId, args.messageId)
    if (existing) {
      await ctx.db.patch(existing._id, { isUpvoted: args.isUpvoted })
      return existing._id
    }
    return ctx.db.insert('feedback', {
      chatId: args.chatId,
      isUpvoted: args.isUpvoted,
      messageId: args.messageId,
      userId: args.userId
    })
  }
})
const voteMine = mutation({
  args: { chatId: v.id('chats'), isUpvoted: v.boolean(), messageId: v.id('messages') },
  handler: async (ctx, args): Promise<Id<'feedback'>> => {
    const userId = await requireOwnerEmail(ctx)
    const existing = await findExistingVote(ctx, args.chatId, args.messageId)
    if (existing) {
      await ctx.db.patch(existing._id, { isUpvoted: args.isUpvoted })
      return existing._id
    }
    return ctx.db.insert('feedback', {
      chatId: args.chatId,
      isUpvoted: args.isUpvoted,
      messageId: args.messageId,
      userId
    })
  }
})
export { vote, voteMine }
