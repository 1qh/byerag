/** biome-ignore-all lint/performance/noAwaitInLoops: sequential test inserts */
/* eslint-disable no-await-in-loop, @typescript-eslint/max-params */
import type { TestConvex } from 'convex-test'
import type { Id } from '../convex/_generated/dataModel'
import type schema from '../convex/schema'
import { internal } from '../convex/_generated/api'

type ChatId = Id<'chats'>
type T = TestConvex<typeof schema>
const sendSecrets = new Map<ChatId, string>()
const send = async (t: T, email: string, content: string, chatId?: ChatId): Promise<ChatId> => {
  const r: { chatId: ChatId; secret: string } = await t.mutation(internal.messages.sendInternal, {
    app: 'test',
    content,
    email,
    ...(chatId ? { chatId } : {})
  })
  sendSecrets.set(r.chatId, r.secret)
  return r.chatId
}
// eslint-disable-next-line @typescript-eslint/require-await
const getSecret = async (_t: T, chatId: ChatId): Promise<string> => sendSecrets.get(chatId) ?? ''
const listMessages = async (t: T, chatId: ChatId): Promise<{ content: string; seq: number; type: string }[]> =>
  t.run(async ctx =>
    ctx.db
      .query('messages')
      .withIndex('by_chat', q => q.eq('chatId', chatId))
      .collect()
  )
const authed = async (t: T, email: string) => {
  const userId = await t.run(async ctx => ctx.db.insert('users', { email }))
  return t.withIdentity({ subject: userId })
}
const addEvents = async (
  t: T,
  chatId: ChatId,
  msgs: { is_error?: boolean; message?: Record<string, unknown>; subtype?: string; type: string }[]
): Promise<void> => {
  await t.run(async ctx => {
    for (let i = 0; i < msgs.length; i += 1)
      await ctx.db.insert('streamEvents', { chatId, content: JSON.stringify(msgs[i]), seq: i })
  })
}
const clearStreaming = async (t: T, chatId: ChatId): Promise<void> => {
  await t.run(async ctx => {
    await ctx.db.patch(chatId, { streaming: false })
  })
}
const listChats = async (
  t: T,
  email: string
): Promise<{ _creationTime: number; owner: string; title: string; turns: number; updatedAt?: number }[]> =>
  t.run(async ctx =>
    (
      await ctx.db
        .query('chats')
        .withIndex('by_owner', q => q.eq('owner', email))
        .collect()
    ).sort((a, b) => b.updatedAt - a.updatedAt)
  )
const listStreamEvents = async (t: T, chatId: ChatId): Promise<{ content: string; seq: number }[]> =>
  t.run(async ctx =>
    ctx.db
      .query('streamEvents')
      .withIndex('by_chat', q => q.eq('chatId', chatId))
      .collect()
  )
export { addEvents, authed, clearStreaming, getSecret, listChats, listMessages, listStreamEvents, send }
