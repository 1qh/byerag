/** biome-ignore-all lint/performance/noAwaitInLoops: sequential Convex DB deletes */
/* eslint-disable no-await-in-loop */
import { v } from 'convex/values'
import type { Doc } from './_generated/dataModel'
import { internal } from './_generated/api'
import { internalMutation, internalQuery, mutation, query } from './_generated/server'
import { getAuthUser, getOwnerEmailOrNull, requireOwnerEmail } from './authHelpers'
import { deleteRuntime, resetEventCount } from './chatRuntime'
import { SEQ_SERVER_ERROR, STREAMING_TIMEOUT_MS } from './constants'
import { generateSecret, hashSecret } from './secretHash'
import { errorEventEnvelope } from './streamProtocol'

const stripSecret = (chat: Doc<'chats'>): Omit<Doc<'chats'>, 'secretHash' | 'sessionId' | 'timeoutFunctionId'> => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { secretHash, sessionId, timeoutFunctionId, ...rest } = chat
  return rest
}
const CHATS_LIST_LIMIT = 200
const countStreaming = internalQuery({
  args: { owner: v.string() },
  handler: async (ctx, { owner }) => {
    const rows = await ctx.db
      .query('chats')
      .withIndex('by_owner_streaming', q => q.eq('owner', owner).eq('streaming', true))
      .take(50)
    return rows.filter(c => c.deletedAt === undefined).length
  }
})
const currentUser = query({
  args: {},
  handler: async ctx => getAuthUser(ctx)
})
const get = internalQuery({
  args: { chatId: v.id('chats') },
  handler: async (ctx, { chatId }) => ctx.db.get(chatId)
})
const getAuthEmail = internalQuery({
  args: {},
  handler: async ctx => {
    const user = await getAuthUser(ctx)
    return user?.email ?? null
  }
})
const list = query({
  args: { app: v.string() },
  handler: async (ctx, { app }) => {
    const email = await getOwnerEmailOrNull(ctx)
    if (!email) return []
    const chats = await ctx.db
      .query('chats')
      .withIndex('by_owner_updatedAt', q => q.eq('owner', email))
      .order('desc')
      .filter(q => q.eq(q.field('deletedAt'), undefined))
      .filter(q => q.eq(q.field('app'), app))
      .take(CHATS_LIST_LIMIT)
    return chats.map(stripSecret)
  }
})
const isStreaming = (chat: Doc<'chats'>): boolean =>
  chat.streaming && Date.now() - chat.streamingStartedAt < STREAMING_TIMEOUT_MS
const SOFT_DELETE_GRACE_MS = 5 * 60_000
interface RequireOwnedChatOpts {
  app: string
  chatId: Doc<'chats'>['_id']
  ctx: { db: { get: (id: Doc<'chats'>['_id']) => Promise<Doc<'chats'> | null> } }
  email: string
}
const requireOwnedChat = async ({ app, chatId, ctx, email }: RequireOwnedChatOpts): Promise<Doc<'chats'>> => {
  const chat = await ctx.db.get(chatId)
  if (!chat) throw new Error('chat not found')
  if (chat.owner !== email) throw new Error('forbidden')
  if (chat.app !== app) throw new Error(`app mismatch: chat belongs to ${chat.app}, not ${app}`)
  return chat
}
const abort = mutation({
  args: { app: v.string(), chatId: v.id('chats') },
  handler: async (ctx, { app, chatId }) => {
    const email = await requireOwnerEmail(ctx)
    const chat = await requireOwnedChat({ app, chatId, ctx, email })
    if (!chat.streaming) return
    const rotated = await hashSecret(generateSecret())
    if (chat.timeoutFunctionId)
      try {
        await ctx.scheduler.cancel(chat.timeoutFunctionId)
      } catch {
        /* Already fired */
      }
    // biome-ignore lint/nursery/noPlaywrightUselessAwait: Convex .first() is thenable
    const sandboxDoc = await ctx.db
      .query('sandboxes')
      .withIndex('by_owner', q => q.eq('owner', email))
      .first()
    const otherStreaming = await ctx.db
      .query('chats')
      .withIndex('by_owner_streaming', q => q.eq('owner', email).eq('streaming', true))
      .take(5)
    const hasOtherActive = otherStreaming.some(c => c._id !== chatId && c.deletedAt === undefined)
    if (sandboxDoc && !hasOtherActive) {
      await ctx.db.delete(sandboxDoc._id)
      await ctx.scheduler.runAfter(0, internal.sandboxKill.killOnly, { sandboxId: sandboxDoc.sandboxId })
    }
    // biome-ignore lint/nursery/noPlaywrightUselessAwait: Convex .first() is thenable
    const existingErr = await ctx.db
      .query('streamEvents')
      .withIndex('by_chat_seq', q => q.eq('chatId', chatId).eq('seq', SEQ_SERVER_ERROR))
      .first()
    const inserts: Promise<unknown>[] = []
    if (!existingErr)
      inserts.push(
        ctx.db.insert('streamEvents', {
          chatId,
          content: errorEventEnvelope('aborted by user'),
          seq: SEQ_SERVER_ERROR
        })
      )
    await Promise.all([
      ...inserts,
      ctx.db.patch(chatId, {
        secretHash: rotated,
        sessionId: undefined,
        streaming: false,
        timeoutFunctionId: undefined
      }),
      resetEventCount(ctx, chatId)
    ])
  },
  returns: v.null()
})
const remove = mutation({
  args: { app: v.string(), chatId: v.id('chats') },
  handler: async (ctx, { app, chatId }) => {
    const email = await requireOwnerEmail(ctx)
    const chat = await requireOwnedChat({ app, chatId, ctx, email })
    if (isStreaming(chat)) throw new Error('cannot delete: chat is streaming')
    await ctx.db.patch(chatId, { deletedAt: Date.now() })
  },
  returns: v.null()
})
const restore = mutation({
  args: { app: v.string(), chatId: v.id('chats') },
  handler: async (ctx, { app, chatId }) => {
    const email = await requireOwnerEmail(ctx)
    const chat = await requireOwnedChat({ app, chatId, ctx, email })
    if (chat.deletedAt === undefined) return
    if (Date.now() - chat.deletedAt > SOFT_DELETE_GRACE_MS) throw new Error('undo window expired')
    await ctx.db.patch(chatId, { deletedAt: undefined })
  },
  returns: v.null()
})
const PRUNE_CHAT_BATCH = 20
const PRUNE_CHILD_BATCH = 500
const hardPruneDeleted = internalMutation({
  args: {},
  handler: async ctx => {
    const cutoff = Date.now() - SOFT_DELETE_GRACE_MS
    const now = Date.now()
    const toPrune = (
      await ctx.db
        .query('chats')
        .withIndex('by_deletedAt', q => q.lte('deletedAt', cutoff))
        .filter(q => q.neq(q.field('deletedAt'), undefined))
        .take(PRUNE_CHAT_BATCH)
    ).filter(c => c.deletedAt !== undefined && now - c.deletedAt >= SOFT_DELETE_GRACE_MS)
    let moreChildren = false
    for (const chat of toPrune) {
      const [msgs, events] = await Promise.all([
        ctx.db
          .query('messages')
          .withIndex('by_chat', q => q.eq('chatId', chat._id))
          .take(PRUNE_CHILD_BATCH),
        ctx.db
          .query('streamEvents')
          .withIndex('by_chat', q => q.eq('chatId', chat._id))
          .take(PRUNE_CHILD_BATCH)
      ])
      await Promise.all([...msgs.map(async m => ctx.db.delete(m._id)), ...events.map(async e => ctx.db.delete(e._id))])
      const batchFull = msgs.length === PRUNE_CHILD_BATCH || events.length === PRUNE_CHILD_BATCH
      if (batchFull) moreChildren = true
      else
        await Promise.all([
          deleteRuntime(ctx, chat._id),
          ctx.db.delete(chat._id),
          ctx.scheduler.runAfter(0, internal.files.cleanupChatDirs, { chatId: chat._id, email: chat.owner })
        ])
    }
    if (moreChildren || toPrune.length === PRUNE_CHAT_BATCH)
      await ctx.scheduler.runAfter(5000, internal.chats.hardPruneDeleted, {})
  }
})
const updateTitle = mutation({
  args: { app: v.string(), chatId: v.id('chats'), title: v.string() },
  handler: async (ctx, { app, chatId, title }) => {
    const email = await requireOwnerEmail(ctx)
    const chat = await requireOwnedChat({ app, chatId, ctx, email })
    if (isStreaming(chat)) throw new Error('cannot rename: chat is streaming')
    const trimmed = title.trim().slice(0, 120)
    if (!trimmed) throw new Error('title cannot be empty')
    await ctx.db.patch(chatId, { title: trimmed, updatedAt: Date.now() })
  },
  returns: v.null()
})
const toggleBookmark = mutation({
  args: { app: v.string(), chatId: v.id('chats'), next: v.boolean() },
  handler: async (ctx, { app, chatId, next }) => {
    const email = await requireOwnerEmail(ctx)
    await requireOwnedChat({ app, chatId, ctx, email })
    await ctx.db.patch(chatId, { isBookmarked: next, updatedAt: Date.now() })
  },
  returns: v.null()
})
const status = query({
  args: { chatId: v.id('chats') },
  handler: async (ctx, { chatId }) => {
    const email = await getOwnerEmailOrNull(ctx)
    if (!email) return { streaming: false, title: '' }
    const chat = await ctx.db.get(chatId)
    if (chat?.owner !== email) return { streaming: false, title: '' }
    if (!chat.streaming) return { streaming: false, title: chat.title }
    const elapsed = Date.now() - chat.streamingStartedAt
    return { streaming: elapsed < STREAMING_TIMEOUT_MS, title: chat.title }
  },
  returns: v.object({ streaming: v.boolean(), title: v.string() })
})
const RECONCILE_BATCH = 200
const reconcileStreamingKillOrphans = internalMutation({
  args: { owners: v.array(v.string()) },
  handler: async (ctx, { owners }) => {
    for (const owner of owners) {
      const liveStreaming = await ctx.db
        .query('chats')
        .withIndex('by_owner_streaming', q => q.eq('owner', owner).eq('streaming', true))
        .take(1)
      if (liveStreaming.length === 0) {
        // biome-ignore lint/nursery/noPlaywrightUselessAwait: Convex .first() returns thenable
        const sandboxDoc = await ctx.db
          .query('sandboxes')
          .withIndex('by_owner', q => q.eq('owner', owner))
          .first()
        if (sandboxDoc)
          await ctx.scheduler.runAfter(0, internal.sandboxKill.kill, {
            owner,
            sandboxId: sandboxDoc.sandboxId
          })
      }
    }
  }
})
const reconcileStreaming = internalMutation({
  args: {},
  handler: async ctx => {
    const cutoff = Date.now() - STREAMING_TIMEOUT_MS
    const stuck = await ctx.db
      .query('chats')
      .withIndex('by_streaming_startedAt', q => q.eq('streaming', true).lt('streamingStartedAt', cutoff))
      .take(RECONCILE_BATCH)
    const orphanOwnerSet = new Set<string>()
    for (const chat of stuck) {
      if (chat.timeoutFunctionId)
        try {
          await ctx.scheduler.cancel(chat.timeoutFunctionId)
        } catch {
          /* Scheduled fn may have already fired */
        }
      const oldEvents = await ctx.db
        .query('streamEvents')
        .withIndex('by_chat', q => q.eq('chatId', chat._id))
        .take(500)
      await Promise.all(oldEvents.map(async e => ctx.db.delete(e._id)))
      await ctx.db.insert('messages', {
        chatId: chat._id,
        content: errorEventEnvelope('reconciled (stuck stream)'),
        seq: chat.messageCount,
        type: 'error'
      })
      await ctx.db.patch(chat._id, { messageCount: chat.messageCount + 1 })
      const rotated = await hashSecret(generateSecret())
      await Promise.all([
        ctx.db.patch(chat._id, {
          secretHash: rotated,
          sessionId: undefined,
          streaming: false,
          timeoutFunctionId: undefined
        }),
        resetEventCount(ctx, chat._id)
      ])
      orphanOwnerSet.add(chat.owner)
    }
    const orphanOwners = [...orphanOwnerSet]
    if (orphanOwners.length > 0)
      await ctx.scheduler.runAfter(0, internal.chats.reconcileStreamingKillOrphans, { owners: orphanOwners })
    if (stuck.length >= RECONCILE_BATCH) await ctx.scheduler.runAfter(1000, internal.chats.reconcileStreaming, {})
  }
})
export {
  abort,
  countStreaming,
  currentUser,
  get,
  getAuthEmail,
  hardPruneDeleted,
  list,
  reconcileStreaming,
  reconcileStreamingKillOrphans,
  remove,
  restore,
  status,
  toggleBookmark,
  updateTitle
}
