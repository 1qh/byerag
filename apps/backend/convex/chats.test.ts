import { expect, test } from 'bun:test'
import { makeTest } from '../test-utils/convex'
import { authed, listChats, send } from '../test-utils/messages-helpers'
import { api, internal } from './_generated/api'

test('list returns chats for a user, sorted desc', async () => {
  const t = makeTest()
  await send(t, 'u@test.com', 'First')
  await new Promise<void>(r => {
    setTimeout(r, 10)
  })
  await send(t, 'u@test.com', 'Second')
  const chats = await listChats(t, 'u@test.com')
  expect(chats).toHaveLength(2)
  expect(chats[0]?._creationTime).toBeGreaterThanOrEqual(chats[1]?._creationTime ?? 0)
})
test('list filters by email — users only see their own chats', async () => {
  const t = makeTest()
  await send(t, 'alice@test.com', 'alice msg')
  await send(t, 'bob@test.com', 'bob msg')
  const alice = await listChats(t, 'alice@test.com')
  const bob = await listChats(t, 'bob@test.com')
  expect(alice).toHaveLength(1)
  expect(bob).toHaveLength(1)
  expect(alice[0]?.title).toBe('alice msg')
  expect(bob[0]?.title).toBe('bob msg')
})
test('remove deletes chat + messages + stream events', async () => {
  const t = makeTest()
  const chatId = await send(t, 'owner@test.com', 'to delete')
  await t.mutation(internal.messages.insertAgentEvent, {
    chatId,
    content: '{"type":"agent"}',
    seq: 0
  })
  await t.run(async ctx => {
    const msgs = await ctx.db
      .query('messages')
      .withIndex('by_chat', q => q.eq('chatId', chatId))
      .collect()
    for (const m of msgs) await ctx.db.delete(m._id)
    const events = await ctx.db
      .query('streamEvents')
      .withIndex('by_chat', q => q.eq('chatId', chatId))
      .collect()
    for (const e of events) await ctx.db.delete(e._id)
    await ctx.db.delete(chatId)
  })
  const deleted: null = (await t.run(async ctx => ctx.db.get(chatId))) as null
  expect(deleted).toBeNull()
})
test("send to other user's chat rejected", async () => {
  const t = makeTest()
  const chatId = await send(t, 'alice@test.com', "alice's chat")
  await t.run(async ctx => {
    await ctx.db.patch(chatId, { streaming: false })
  })
  await expect(
    t.mutation(internal.messages.sendInternal, { app: 'user', chatId, content: 'hijack', email: 'bob@test.com' })
  ).rejects.toThrow('unauthorized')
})
test('chat has all required fields on creation', async () => {
  const t = makeTest()
  const chatId = await send(t, 'fields@test.com', 'test')
  const chat: null | {
    messageCount?: number
    owner?: string
    secretHash?: string
    streaming?: boolean
    streamingStartedAt?: number
    turns?: number
  } = await t.run(async ctx => ctx.db.get(chatId))
  expect(chat?.streaming).toBeTruthy()
  expect(chat?.streamingStartedAt).toBeGreaterThan(0)
  expect(chat?.messageCount).toBe(1)
  expect(chat?.secretHash).toHaveLength(64)
  expect(chat?.owner).toBe('fields@test.com')
  expect(chat?.turns).toBe(1)
})
test('streaming timeout — stale streaming flag treated as false', async () => {
  const t = makeTest()
  const chatId = await send(t, 'timeout@test.com', 'test')
  await t.run(async ctx => {
    await ctx.db.patch(chatId, {
      streamingStartedAt: Date.now() - 11 * 60 * 1000
    })
  })
  const chat: null | { streaming?: boolean; streamingStartedAt?: number } = await t.run(async ctx => ctx.db.get(chatId))
  const elapsed = Date.now() - (chat?.streamingStartedAt ?? 0)
  expect(elapsed).toBeGreaterThan(10 * 60 * 1000)
  expect(chat?.streaming).toBeTruthy()
})
test('chats.list returns empty without auth', async () => {
  const t = makeTest()
  await send(t, 'noauth@test.com', 'test')
  const chats: unknown[] = await t.query(api.chats.list, { app: 'user' })
  expect(chats).toHaveLength(0)
})
test('chats.status returns false without auth', async () => {
  const t = makeTest()
  const chatId = await send(t, 'stat@test.com', 'test')
  const result: { streaming: boolean } = await t.query(api.chats.status, { chatId })
  expect(result.streaming).toBeFalsy()
})
test('chats.remove rejects without auth', async () => {
  const t = makeTest()
  const chatId = await send(t, 'rmauth@test.com', 'test')
  await expect(t.mutation(api.chats.remove, { app: 'user', chatId })).rejects.toThrow('not authenticated')
  const chat: unknown = await t.run(async ctx => ctx.db.get(chatId))
  expect(chat).not.toBeNull()
})
test('testing.send rejects without TEST_SECRET env', async () => {
  const t = makeTest()
  const prior = process.env.TEST_SECRET
  delete process.env.TEST_SECRET
  try {
    await expect(
      t.mutation(api.testing.send, { app: 'user', content: 'hi', email: 'x@test.com', testSecret: 'anything' })
    ).rejects.toThrow('testing endpoints disabled')
  } finally {
    if (prior !== undefined) process.env.TEST_SECRET = prior
  }
})
test('testing.send rejects wrong TEST_SECRET', async () => {
  const t = makeTest()
  process.env.TEST_SECRET = 'correct-secret'
  try {
    await expect(
      t.mutation(api.testing.send, { app: 'user', content: 'hi', email: 'x@test.com', testSecret: 'wrong' })
    ).rejects.toThrow('invalid test secret')
  } finally {
    delete process.env.TEST_SECRET
  }
})
test('countStreaming counts only streaming chats', async () => {
  const t = makeTest()
  const c1 = await send(t, 'cnt@test.com', 'First')
  await send(t, 'cnt@test.com', 'Second')
  let count: number = await t.query(internal.chats.countStreaming, { owner: 'cnt@test.com' })
  expect(count).toBe(2)
  await t.run(async ctx => {
    await ctx.db.patch(c1, { streaming: false })
  })
  count = await t.query(internal.chats.countStreaming, { owner: 'cnt@test.com' })
  expect(count).toBe(1)
})
test('chat secretHash stored, raw secret never persisted', async () => {
  const t = makeTest()
  const chatId = await send(t, 'strip@test.com', 'test')
  const raw: null | { secretHash?: string } = await t.run(async ctx => ctx.db.get(chatId))
  expect(raw?.secretHash).toHaveLength(64)
  expect(raw?.secretHash).toMatch(/^[0-9a-f]{64}$/u)
})
test('internal chats.get returns chat by id', async () => {
  const t = makeTest()
  const chatId = await send(t, 'getone@test.com', 'hi')
  const chat: null | { owner?: string } = await t.query(internal.chats.get, { chatId })
  expect(chat?.owner).toBe('getone@test.com')
})
test('internal chats.get returns null for fake id', async () => {
  const t = makeTest()
  const realId = await send(t, 'fake@test.com', 'x')
  await t.run(async ctx => {
    await ctx.db.delete(realId)
  })
  const chat = await t.query(internal.chats.get, { chatId: realId })
  expect(chat).toBeNull()
})
test('chats.getAuthEmail returns null without auth', async () => {
  const t = makeTest()
  const email: null | string = await t.query(internal.chats.getAuthEmail, {})
  expect(email).toBeNull()
})
test('chats.currentUser returns null without auth', async () => {
  const t = makeTest()
  const user = await t.query(api.chats.currentUser, {})
  expect(user).toBeNull()
})
test('chats.remove no-op for other user chat (no throw)', async () => {
  const t = makeTest()
  const chatId = await send(t, 'owner@test.com', 'hi')
  await expect(t.mutation(api.chats.remove, { app: 'user', chatId })).rejects.toThrow('not authenticated')
})
test('testing.listMessages returns messages', async () => {
  const t = makeTest()
  process.env.TEST_SECRET = 'ts1'
  try {
    const chatId = await send(t, 'tm@test.com', 'hi')
    const res = (await t.query(api.testing.listMessages, {
      chatId,
      paginationOpts: { cursor: null, numItems: 10 },
      testSecret: 'ts1'
    })) as { page: unknown[] }
    expect(res.page.length).toBeGreaterThan(0)
  } finally {
    delete process.env.TEST_SECRET
  }
})
test('testing.listChats strips secret', async () => {
  const t = makeTest()
  process.env.TEST_SECRET = 'ts2'
  try {
    await send(t, 'lc@test.com', 'hi')
    const chats = (await t.query(api.testing.listChats, { email: 'lc@test.com', testSecret: 'ts2' })) as {
      secret?: string
    }[]
    expect(chats).toHaveLength(1)
    expect(chats[0]?.secret).toBeUndefined()
  } finally {
    delete process.env.TEST_SECRET
  }
})
test('testing.removeChat deletes chat', async () => {
  const t = makeTest()
  process.env.TEST_SECRET = 'ts3'
  try {
    const chatId = await send(t, 'rc@test.com', 'hi')
    await t.mutation(api.testing.removeChat, { chatId, email: 'rc@test.com', testSecret: 'ts3' })
    const chat = await t.run(async ctx => ctx.db.get(chatId))
    expect(chat).toBeNull()
  } finally {
    delete process.env.TEST_SECRET
  }
})
test('testing.removeChat no-op on wrong email', async () => {
  const t = makeTest()
  process.env.TEST_SECRET = 'ts4'
  try {
    const chatId = await send(t, 'owner2@test.com', 'hi')
    await t.mutation(api.testing.removeChat, { chatId, email: 'other@test.com', testSecret: 'ts4' })
    const chat = await t.run(async ctx => ctx.db.get(chatId))
    expect(chat).not.toBeNull()
  } finally {
    delete process.env.TEST_SECRET
  }
})
test('testing.listStreamEvents returns events', async () => {
  const t = makeTest()
  process.env.TEST_SECRET = 'ts5'
  try {
    const chatId = await send(t, 'sev@test.com', 'hi')
    await t.mutation(internal.messages.insertAgentEvent, {
      chatId,
      content: '{"type":"agent"}',
      seq: 0
    })
    const events = (await t.query(api.testing.listStreamEvents, { chatId, testSecret: 'ts5' })) as unknown[]
    expect(events.length).toBeGreaterThan(0)
  } finally {
    delete process.env.TEST_SECRET
  }
})
test('testing.listMessages rejects wrong secret', async () => {
  const t = makeTest()
  process.env.TEST_SECRET = 'good'
  try {
    const chatId = await send(t, 'reject@test.com', 'hi')
    await expect(
      t.query(api.testing.listMessages, {
        chatId,
        paginationOpts: { cursor: null, numItems: 10 },
        testSecret: 'bad'
      })
    ).rejects.toThrow('invalid test secret')
  } finally {
    delete process.env.TEST_SECRET
  }
})
test('updateTitle patches chat title', async () => {
  const t = makeTest()
  const chatId = await send(t, 'rename@test.com', 'original')
  await t.run(async ctx => {
    await ctx.db.patch(chatId, { streaming: false })
  })
  const a = await authed(t, 'rename@test.com')
  await a.mutation(api.chats.updateTitle, { app: 'user', chatId, title: 'renamed' })
  const chat = await t.run(async ctx => ctx.db.get(chatId))
  expect(chat?.title).toBe('renamed')
})
test('updateTitle rejects while streaming', async () => {
  const t = makeTest()
  const chatId = await send(t, 'rn2@test.com', 'original')
  const a = await authed(t, 'rn2@test.com')
  await expect(a.mutation(api.chats.updateTitle, { app: 'user', chatId, title: 'new' })).rejects.toThrow('streaming')
})
test('updateTitle rejects empty title', async () => {
  const t = makeTest()
  const chatId = await send(t, 'rn3@test.com', 'original')
  await t.run(async ctx => {
    await ctx.db.patch(chatId, { streaming: false })
  })
  const a = await authed(t, 'rn3@test.com')
  await expect(a.mutation(api.chats.updateTitle, { app: 'user', chatId, title: '   ' })).rejects.toThrow('empty')
})
test('remove sets deletedAt (soft delete), list filters it', async () => {
  const t = makeTest()
  const chatId = await send(t, 'soft@test.com', 'bye')
  await t.run(async ctx => {
    await ctx.db.patch(chatId, { streaming: false })
  })
  const a = await authed(t, 'soft@test.com')
  await a.mutation(api.chats.remove, { app: 'user', chatId })
  const chat = await t.run(async ctx => ctx.db.get(chatId))
  expect(chat?.deletedAt).toBeGreaterThan(0)
  const visible = await a.query(api.chats.list, { app: 'user' })
  expect(visible.find(c => c._id === chatId)).toBeUndefined()
})
test('restore clears deletedAt within window', async () => {
  const t = makeTest()
  const chatId = await send(t, 'restore@test.com', 'oops')
  await t.run(async ctx => {
    await ctx.db.patch(chatId, { streaming: false })
  })
  const a = await authed(t, 'restore@test.com')
  await a.mutation(api.chats.remove, { app: 'user', chatId })
  await a.mutation(api.chats.restore, { app: 'user', chatId })
  const chat = await t.run(async ctx => ctx.db.get(chatId))
  expect(chat?.deletedAt).toBeUndefined()
  const visible = await a.query(api.chats.list, { app: 'user' })
  expect(visible.find(c => c._id === chatId)).toBeDefined()
})
test('restore rejects after undo window expires', async () => {
  const t = makeTest()
  const chatId = await send(t, 'expired@test.com', 'long gone')
  await t.run(async ctx => {
    await ctx.db.patch(chatId, { deletedAt: Date.now() - 10 * 60_000, streaming: false })
  })
  const a = await authed(t, 'expired@test.com')
  await expect(a.mutation(api.chats.restore, { app: 'user', chatId })).rejects.toThrow('undo window')
})
test('remove rejects while streaming', async () => {
  const t = makeTest()
  const chatId = await send(t, 'busy@test.com', 'live')
  const a = await authed(t, 'busy@test.com')
  await expect(a.mutation(api.chats.remove, { app: 'user', chatId })).rejects.toThrow('streaming')
})
test('hardPruneDeleted cascades messages + streamEvents', async () => {
  const t = makeTest()
  const chatId = await send(t, 'prune@test.com', 'gone')
  await t.run(async ctx => {
    await ctx.db.insert('streamEvents', { chatId, content: '{}', seq: 0 })
    await ctx.db.patch(chatId, { deletedAt: Date.now() - 10 * 60_000, streaming: false })
  })
  await t.mutation(internal.chats.hardPruneDeleted, {})
  const chat = await t.run(async ctx => ctx.db.get(chatId))
  expect(chat).toBeNull()
  const evs = await t.run(async ctx =>
    ctx.db
      .query('streamEvents')
      .withIndex('by_chat', q => q.eq('chatId', chatId))
      .collect()
  )
  expect(evs).toHaveLength(0)
})
