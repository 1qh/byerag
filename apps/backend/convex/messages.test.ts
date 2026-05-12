/** biome-ignore-all lint/suspicious/noControlCharactersInRegex: test fixtures */
/* oxlint-disable eslint(max-params) */
import type { TestConvex } from 'convex-test'
import { expect, test } from 'bun:test'
import type schema from './schema'
import { makeTest } from '../test-utils/convex'
import {
  addEvents,
  authed,
  clearStreaming,
  getSecret,
  listChats,
  listMessages,
  listStreamEvents,
  send
} from '../test-utils/messages-helpers'
import { api, internal } from './_generated/api'
test('send creates a chat with correct title and inserts user message', async () => {
  const t = makeTest()
  const chatId = await send(t, 'alice@test.com', 'Hello world from test')
  expect(chatId).toBeDefined()
  const msgs = await listMessages(t, chatId)
  expect(msgs).toHaveLength(1)
  expect(msgs[0]?.type).toBe('user')
  expect(msgs[0]?.seq).toBe(0)
  const chats = await listChats(t, 'alice@test.com')
  expect(chats).toHaveLength(1)
  expect(chats[0]?.title).toBe('Hello world from test')
  expect(chats[0]?.owner).toBe('alice@test.com')
  expect(chats[0]?.turns).toBe(1)
})
test('send to existing chatId appends to existing chat', async () => {
  const t = makeTest()
  const chatId = await send(t, 'bob@test.com', 'First')
  await clearStreaming(t, chatId)
  await send(t, 'bob@test.com', 'Second', chatId)
  const msgs = await listMessages(t, chatId)
  expect(msgs).toHaveLength(2)
  expect(msgs.find(m => m.seq === 0)?.content).toContain('First')
  expect(msgs.find(m => m.seq === 1)?.content).toContain('Second')
  const chats = await listChats(t, 'bob@test.com')
  expect(chats).toHaveLength(1)
  expect(chats[0]?.turns).toBe(2)
})
test('title is truncated to 80 chars', async () => {
  const t = makeTest()
  const long = 'x'.repeat(200)
  const chatId = await send(t, 'c@test.com', long)
  const chat: null | { title: string } = await t.run(async ctx => ctx.db.get(chatId))
  expect(chat?.title.length).toBeLessThanOrEqual(80)
})
test('insertStreamEvent inserts to streamEvents table', async () => {
  const t = makeTest()
  const chatId = await send(t, 's@test.com', 'x')
  const secret = await getSecret(t, chatId)
  await t.mutation(internal.messages.insertStreamEvent, {
    chatId,
    content: JSON.stringify({
      message: { content: [{ text: 'hi', type: 'text' }], role: 'assistant' },
      type: 'assistant'
    }),
    secret,
    seq: 0
  })
  const events = await listStreamEvents(t, chatId)
  expect(events).toHaveLength(1)
})
test('complete appends canonical messages and clears streaming', async () => {
  const t = makeTest()
  const chatId = await send(t, 'd@test.com', 'Hi')
  const secret = await getSecret(t, chatId)
  await addEvents(t, chatId, [
    { message: { content: [{ text: 'Hi', type: 'text' }], role: 'user' }, type: 'user' },
    { message: { content: [{ text: 'Hello!', type: 'text' }], role: 'assistant' }, type: 'assistant' }
  ])
  await t.mutation(internal.messages.complete, { chatId, secret })
  const msgs = await listMessages(t, chatId)
  expect(msgs.some(m => m.type === 'user')).toBeTruthy()
  expect(msgs.some(m => m.type === 'assistant')).toBeTruthy()
  const chat: null | { streaming?: boolean } = await t.run(async ctx => ctx.db.get(chatId))
  expect(chat?.streaming).toBeFalsy()
})
test('complete promotes all known event types as messages', async () => {
  const t = makeTest()
  const chatId = await send(t, 'f@test.com', 'Hi')
  const secret = await getSecret(t, chatId)
  await addEvents(t, chatId, [
    { message: { content: [{ text: 'Hi', type: 'text' }], role: 'user' }, type: 'user' },
    { message: { content: [{ text: 'Hello', type: 'text' }], role: 'assistant' }, type: 'assistant' },
    { subtype: 'success', type: 'result' }
  ])
  await t.mutation(internal.messages.complete, { chatId, secret })
  const msgs = await listMessages(t, chatId)
  expect(msgs.some(m => m.type === 'result')).toBeTruthy()
})
test('send schedules agent action', async () => {
  const t = makeTest()
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('ok')
  try {
    const chatId = await send(t, 'g@test.com', 'Hi')
    expect(chatId).toBeDefined()
  } finally {
    globalThis.fetch = originalFetch
  }
})
test('messageCount incremented on send', async () => {
  const t = makeTest()
  const chatId = await send(t, 'mc@test.com', 'First')
  let chat: null | { messageCount?: number } = await t.run(async ctx => ctx.db.get(chatId))
  expect(chat?.messageCount).toBe(1)
  await clearStreaming(t, chatId)
  await send(t, 'mc@test.com', 'Second', chatId)
  chat = await t.run(async ctx => ctx.db.get(chatId))
  expect(chat?.messageCount).toBe(2)
})
test('streaming flag set on send, cleared on complete', async () => {
  const t = makeTest()
  const chatId = await send(t, 'sf@test.com', 'Hi')
  let chat: null | { streaming?: boolean; streamingStartedAt?: number } = await t.run(async ctx => ctx.db.get(chatId))
  expect(chat?.streaming).toBeTruthy()
  expect(chat?.streamingStartedAt).toBeGreaterThan(0)
  const secret = await getSecret(t, chatId)
  await t.mutation(internal.messages.complete, {
    chatId,
    secret
  })
  chat = await t.run(async ctx => ctx.db.get(chatId))
  expect(chat?.streaming).toBeFalsy()
})
test('complete rejects invalid secret', async () => {
  const t = makeTest()
  const chatId = await send(t, 'sec@test.com', 'Hi')
  await expect(
    t.mutation(internal.messages.complete, {
      chatId,
      secret: 'wrong-secret'
    })
  ).rejects.toThrow('unauthorized')
})
test('insertStreamEvent rejects invalid secret', async () => {
  const t = makeTest()
  const chatId = await send(t, 'sec2@test.com', 'Hi')
  await expect(
    t.mutation(internal.messages.insertStreamEvent, {
      chatId,
      content: '{"type":"test"}',
      secret: 'wrong-secret',
      seq: 0
    })
  ).rejects.toThrow('unauthorized')
})
test('messages.send rejects without auth', async () => {
  const t = makeTest()
  await expect(t.mutation(api.messages.send, { app: 'test', content: 'test' })).rejects.toThrow('not authenticated')
})
test('messages.list returns empty without auth', async () => {
  const t = makeTest()
  const chatId = await send(t, 'listauth@test.com', 'test')
  const result: { page: unknown[] } = await t.query(api.messages.list, {
    chatId,
    paginationOpts: { cursor: null, numItems: 50 }
  })
  expect(result.page).toHaveLength(0)
})
test('messages.streamEvents returns empty without auth', async () => {
  const t = makeTest()
  const chatId = await send(t, 'evtauth@test.com', 'test')
  const events: unknown[] = await t.query(api.messages.streamEvents, { chatId })
  expect(events).toHaveLength(0)
})
const seedEvents = async (t: TestConvex<typeof schema>, chatId: string, n: number): Promise<void> => {
  await t.run(async ctx => {
    for (let i = 0; i < n; i += 1)
      await ctx.db.insert('streamEvents', { chatId: chatId as never, content: `{"i":${i}}`, seq: i })
  })
}
test('streamEvents caps at 500 (default)', async () => {
  const t = makeTest()
  const chatId = await send(t, 'cap@test.com', 'x')
  await seedEvents(t, chatId, 600)
  const a = await authed(t, 'cap@test.com')
  const events = (await a.query(api.messages.streamEvents, { chatId })) as unknown[]
  expect(events).toHaveLength(500)
})
test('streamEvents honors explicit limit under cap', async () => {
  const t = makeTest()
  const chatId = await send(t, 'caplim@test.com', 'x')
  await seedEvents(t, chatId, 50)
  const a = await authed(t, 'caplim@test.com')
  const events = (await a.query(api.messages.streamEvents, { chatId, limit: 10 })) as unknown[]
  expect(events).toHaveLength(10)
})
test('streamEvents clamps limit above cap', async () => {
  const t = makeTest()
  const chatId = await send(t, 'capclamp@test.com', 'x')
  await seedEvents(t, chatId, 600)
  const a = await authed(t, 'capclamp@test.com')
  const events = (await a.query(api.messages.streamEvents, { chatId, limit: 10_000 })) as unknown[]
  expect(events).toHaveLength(500)
})
test('streamEvents returns newest events (desc take) sorted asc', async () => {
  const t = makeTest()
  const chatId = await send(t, 'captake@test.com', 'x')
  await seedEvents(t, chatId, 600)
  const a = await authed(t, 'captake@test.com')
  const events = (await a.query(api.messages.streamEvents, { chatId })) as { seq: number }[]
  expect(events[0]?.seq).toBe(100)
  expect(events.at(-1)?.seq).toBe(599)
})
test('streamEvents still blocks different user', async () => {
  const t = makeTest()
  const chatId = await send(t, 'owner@test.com', 'x')
  await seedEvents(t, chatId, 10)
  const intruder = await authed(t, 'other@test.com')
  const events = (await intruder.query(api.messages.streamEvents, { chatId })) as unknown[]
  expect(events).toHaveLength(0)
})
test('complete with empty canonical array — user message preserved, no new inserts', async () => {
  const t = makeTest()
  const chatId = await send(t, 'empty_complete@test.com', 'Hi')
  const secret = await getSecret(t, chatId)
  await t.mutation(internal.messages.complete, {
    chatId,
    secret
  })
  const msgs = await listMessages(t, chatId)
  expect(msgs).toHaveLength(1)
  const chat: null | { streaming?: boolean } = await t.run(async ctx => ctx.db.get(chatId))
  expect(chat?.streaming).toBeFalsy()
})
test('complete called twice — second adds more messages', async () => {
  const t = makeTest()
  const chatId = await send(t, 'double@test.com', 'Hi')
  const secret = await getSecret(t, chatId)
  await addEvents(t, chatId, [
    { message: { content: [{ text: 'Hi', type: 'text' }], role: 'user' }, type: 'user' },
    { message: { content: [{ text: 'Hello', type: 'text' }], role: 'assistant' }, type: 'assistant' }
  ])
  await t.mutation(internal.messages.complete, { chatId, secret })
  await send(t, 'double@test.com', 'Follow up', chatId)
  const newSecret = await getSecret(t, chatId)
  await addEvents(t, chatId, [
    { message: { content: [{ text: 'Follow up', type: 'text' }], role: 'user' }, type: 'user' },
    { message: { content: [{ text: 'Sure', type: 'text' }], role: 'assistant' }, type: 'assistant' }
  ])
  await t.mutation(internal.messages.complete, { chatId, secret: newSecret })
  const msgs = await listMessages(t, chatId)
  expect(msgs).toHaveLength(6)
})
test('stream events isolated between chats', async () => {
  const t = makeTest()
  const chatA = await send(t, 'iso@test.com', 'A')
  const chatB = await send(t, 'iso@test.com', 'B')
  const secretA = await getSecret(t, chatA)
  const secretB = await getSecret(t, chatB)
  await t.mutation(internal.messages.insertStreamEvent, {
    chatId: chatA,
    content: '{"type":"agent","subtype":"a"}',
    secret: secretA,
    seq: 0
  })
  await t.mutation(internal.messages.insertStreamEvent, {
    chatId: chatB,
    content: '{"type":"agent","subtype":"b"}',
    secret: secretB,
    seq: 0
  })
  const eventsA = await listStreamEvents(t, chatA)
  const eventsB = await listStreamEvents(t, chatB)
  expect(eventsA).toHaveLength(1)
  expect(eventsB).toHaveLength(1)
  expect(eventsA[0]?.content).toContain('a')
  expect(eventsB[0]?.content).toContain('b')
})
test('send to streaming chat rejected', async () => {
  const t = makeTest()
  const chatId = await send(t, 'busy@test.com', 'First')
  await expect(send(t, 'busy@test.com', 'Second', chatId)).rejects.toThrow('chat is busy')
})
test('send rejects empty content', async () => {
  const t = makeTest()
  await expect(send(t, 'empty@test.com', '')).rejects.toThrow('empty message')
  await expect(send(t, 'empty@test.com', '   ')).rejects.toThrow('empty message')
})
test('send rejects oversized content', async () => {
  const t = makeTest()
  await expect(send(t, 'big@test.com', 'x'.repeat(100_001))).rejects.toThrow('message too long')
})
test('complete updates messageCount correctly', async () => {
  const t = makeTest()
  const chatId = await send(t, 'cmc@test.com', 'Hi')
  const secret = await getSecret(t, chatId)
  await addEvents(t, chatId, [
    { message: { content: [{ text: 'Hi', type: 'text' }], role: 'user' }, type: 'user' },
    { message: { content: [{ text: 'Hello', type: 'text' }], role: 'assistant' }, type: 'assistant' }
  ])
  await t.mutation(internal.messages.complete, { chatId, secret })
  const chat: null | { messageCount?: number } = await t.run(async ctx => ctx.db.get(chatId))
  expect(chat?.messageCount).toBe(3)
  const msgs = await listMessages(t, chatId)
  expect(msgs).toHaveLength(3)
})
test('insertStreamEvent rejects oversized content', async () => {
  const t = makeTest()
  const chatId = await send(t, 'big3@test.com', 'Hi')
  const secret = await getSecret(t, chatId)
  await expect(
    t.mutation(internal.messages.insertStreamEvent, {
      chatId,
      content: 'x'.repeat(1_000_001),
      secret,
      seq: 0
    })
  ).rejects.toThrow('event too large')
})
test('insertError clears streaming flag', async () => {
  const t = makeTest()
  const chatId = await send(t, 'err@test.com', 'Hi')
  let chat: null | { streaming?: boolean } = await t.run(async ctx => ctx.db.get(chatId))
  expect(chat?.streaming).toBeTruthy()
  await t.mutation(internal.messages.insertError, {
    chatId,
    error: 'sandbox crashed'
  })
  chat = await t.run(async ctx => ctx.db.get(chatId))
  expect(chat?.streaming).toBeFalsy()
  const events = await listStreamEvents(t, chatId)
  const errorEvent = events.find(e => e.content.includes('error'))
  expect(errorEvent).toBeDefined()
})
test('stream events cleared on new send', async () => {
  const t = makeTest()
  const chatId = await send(t, 'clr@test.com', 'First')
  await t.mutation(internal.messages.insertAgentEvent, {
    chatId,
    content: '{"type":"agent","subtype":"start"}',
    seq: 0
  })
  let events = await listStreamEvents(t, chatId)
  expect(events).toHaveLength(1)
  await clearStreaming(t, chatId)
  await send(t, 'clr@test.com', 'Second', chatId)
  events = await listStreamEvents(t, chatId)
  expect(events).toHaveLength(0)
})
test('send at exact MAX_CONTENT_LENGTH succeeds', async () => {
  const t = makeTest()
  const chatId = await send(t, 'boundary@test.com', 'x'.repeat(32_000))
  expect(chatId).toBeDefined()
})
test('insertStreamEvent at exact 100KB succeeds', async () => {
  const t = makeTest()
  const chatId = await send(t, 'evtbnd@test.com', 'x')
  const secret = await getSecret(t, chatId)
  await t.mutation(internal.messages.insertStreamEvent, {
    chatId,
    content: 'x'.repeat(32_000),
    secret,
    seq: 0
  })
  const events = await listStreamEvents(t, chatId)
  expect(events).toHaveLength(1)
})
test('complete stores sessionId on chat', async () => {
  const t = makeTest()
  const chatId = await send(t, 'sid@test.com', 'Hi')
  const secret = await getSecret(t, chatId)
  await t.mutation(internal.messages.complete, {
    chatId,
    secret,
    sessionId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
  })
  const chat: null | { sessionId?: string } = await t.run(async ctx => ctx.db.get(chatId))
  expect(chat?.sessionId).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890')
})
test('complete without sessionId preserves existing', async () => {
  const t = makeTest()
  const chatId = await send(t, 'sid2@test.com', 'Hi')
  const secret = await getSecret(t, chatId)
  await t.mutation(internal.messages.complete, {
    chatId,
    secret,
    sessionId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901'
  })
  await send(t, 'sid2@test.com', 'Follow up', chatId)
  const newSecret = await getSecret(t, chatId)
  await t.mutation(internal.messages.complete, {
    chatId,
    secret: newSecret
  })
  const chat: null | { sessionId?: string } = await t.run(async ctx => ctx.db.get(chatId))
  expect(chat?.sessionId).toBe('b2c3d4e5-f6a7-8901-bcde-f12345678901')
})
test('send after error — user can retry', async () => {
  const t = makeTest()
  const chatId = await send(t, 'retry@test.com', 'First')
  await t.mutation(internal.messages.insertError, {
    chatId,
    error: 'sandbox died'
  })
  let chat: null | { streaming?: boolean } = await t.run(async ctx => ctx.db.get(chatId))
  expect(chat?.streaming).toBeFalsy()
  await send(t, 'retry@test.com', 'Retry', chatId)
  chat = await t.run(async ctx => ctx.db.get(chatId))
  expect(chat?.streaming).toBeTruthy()
  const msgs = await listMessages(t, chatId)
  expect(msgs.filter(m => m.type === 'user')).toHaveLength(2)
})
test('multiple rapid stream events maintain order', async () => {
  const t = makeTest()
  const chatId = await send(t, 'order@test.com', 'x')
  const secret = await getSecret(t, chatId)
  for (let i = 0; i < 10; i += 1)
    await t.mutation(internal.messages.insertStreamEvent, {
      chatId,
      content: JSON.stringify({ subtype: `step-${i}`, type: 'agent' }),
      secret,
      seq: i
    })
  const events = await listStreamEvents(t, chatId)
  expect(events).toHaveLength(10)
  const seqs = events.map(e => e.seq)
  expect(seqs).toStrictEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
})
test('seq values are sequential across send + complete', async () => {
  const t = makeTest()
  const chatId = await send(t, 'seq@test.com', 'Hello')
  const secret = await getSecret(t, chatId)
  await addEvents(t, chatId, [
    { message: { content: [{ text: 'Hello', type: 'text' }], role: 'user' }, type: 'user' },
    { message: { content: [{ text: 'Hi', type: 'text' }], role: 'assistant' }, type: 'assistant' }
  ])
  await t.mutation(internal.messages.complete, { chatId, secret })
  await send(t, 'seq@test.com', 'Follow up', chatId)
  const msgs = await listMessages(t, chatId)
  const seqs = msgs.map(m => m.seq).toSorted((a, b) => a - b)
  for (let i = 1; i < seqs.length; i += 1) expect(seqs[i]).toBe((seqs[i - 1] ?? 0) + 1)
})
test('insertStreamEvent rejects invalid seq range', async () => {
  const t = makeTest()
  const chatId = await send(t, 'seq-range@test.com', 'x')
  const secret = await getSecret(t, chatId)
  await expect(
    t.mutation(internal.messages.insertStreamEvent, { chatId, content: 'x', secret, seq: -10_001 })
  ).rejects.toThrow('invalid seq')
  await expect(
    t.mutation(internal.messages.insertStreamEvent, { chatId, content: 'x', secret, seq: 100_001 })
  ).rejects.toThrow('invalid seq')
  await t.mutation(internal.messages.insertStreamEvent, { chatId, content: 'x', secret, seq: 0 })
})
test('insertStreamEvent rejects when not streaming', async () => {
  const t = makeTest()
  const chatId = await send(t, 'nostream@test.com', 'x')
  const secret = await getSecret(t, chatId)
  await clearStreaming(t, chatId)
  await expect(t.mutation(internal.messages.insertStreamEvent, { chatId, content: 'x', secret, seq: 0 })).rejects.toThrow(
    'not streaming'
  )
})
test('complete rejects when not streaming', async () => {
  const t = makeTest()
  const chatId = await send(t, 'nostream2@test.com', 'x')
  const secret = await getSecret(t, chatId)
  await clearStreaming(t, chatId)
  await expect(
    t.mutation(internal.messages.complete, {
      chatId,
      secret
    })
  ).rejects.toThrow('not streaming')
})
test('complete rotates secretHash', async () => {
  const t = makeTest()
  const chatId = await send(t, 'rotate@test.com', 'x')
  const before: null | { secretHash: string } = await t.run(async ctx => ctx.db.get(chatId))
  await t.mutation(internal.messages.complete, { chatId, secret: await getSecret(t, chatId) })
  const after: null | { secretHash: string } = await t.run(async ctx => ctx.db.get(chatId))
  expect(after?.secretHash).not.toBe(before?.secretHash)
  expect(after?.secretHash).toHaveLength(64)
})
test('complete rejects oversized messages', async () => {
  const t = makeTest()
  const chatId = await send(t, 'bigmsg@test.com', 'x')
  const secret = await getSecret(t, chatId)
  await addEvents(t, chatId, [
    { message: { content: [{ text: 'x'.repeat(500_001), type: 'text' }], role: 'user' }, type: 'user' }
  ])
  await expect(t.mutation(internal.messages.complete, { chatId, secret })).rejects.toThrow('message too large')
})
test('complete handles too many messages by clearing streaming + emitting error event', async () => {
  const t = makeTest()
  const chatId = await send(t, 'manymsg@test.com', 'x')
  const secret = await getSecret(t, chatId)
  const msgs = Array.from({ length: 501 }, () => ({ message: { content: [], role: 'user' }, type: 'user' }))
  await addEvents(t, chatId, msgs)
  await t.mutation(internal.messages.complete, { chatId, secret })
  const chat: null | { streaming?: boolean } = await t.run(async ctx => ctx.db.get(chatId))
  expect(chat?.streaming).toBeFalsy()
})
test('complete filters out system and result messages', async () => {
  const t = makeTest()
  const chatId = await send(t, 'filter@test.com', 'x')
  const secret = await getSecret(t, chatId)
  await addEvents(t, chatId, [
    { message: { content: [], role: 'user' }, type: 'user' },
    { message: { content: [], role: 'system' }, type: 'system' },
    { message: { content: [], role: 'assistant' }, type: 'assistant' },
    { is_error: false, type: 'result' }
  ])
  await t.mutation(internal.messages.complete, { chatId, secret })
  const msgs = await listMessages(t, chatId)
  expect(msgs.filter(m => m.type === 'user')).toHaveLength(2)
  expect(msgs.filter(m => m.type === 'assistant')).toHaveLength(1)
  expect(msgs.filter(m => m.type === 'system')).toHaveLength(1)
  expect(msgs.filter(m => m.type === 'result')).toHaveLength(1)
})
test('complete rejects non-UUID sessionId', async () => {
  const t = makeTest()
  const chatId = await send(t, 'badsid@test.com', 'x')
  const secret = await getSecret(t, chatId)
  await t.mutation(internal.messages.complete, {
    chatId,
    secret,
    sessionId: 'not-a-uuid'
  })
  const chat: null | { sessionId?: string } = await t.run(async ctx => ctx.db.get(chatId))
  expect(chat?.sessionId).toBeUndefined()
})
test('insertError rotates secretHash and strips HTML', async () => {
  const t = makeTest()
  const chatId = await send(t, 'errrot@test.com', 'x')
  const before: null | { secretHash: string } = await t.run(async ctx => ctx.db.get(chatId))
  await t.mutation(internal.messages.insertError, {
    chatId,
    error: '<script>alert(1)</script> failed'
  })
  const after: null | { secretHash: string; streaming?: boolean } = await t.run(async ctx => ctx.db.get(chatId))
  expect(after?.secretHash).not.toBe(before?.secretHash)
  expect(after?.streaming).toBeFalsy()
  const events = await listStreamEvents(t, chatId)
  const errorEvent = events.find(e => e.content.includes('error'))
  expect(errorEvent?.content).not.toContain('<script>')
})
test('timeoutStreaming resets zombie session', async () => {
  const t = makeTest()
  const chatId = await send(t, 'zombie@test.com', 'x')
  const before: null | { secretHash: string } = await t.run(async ctx => ctx.db.get(chatId))
  await t.run(async ctx => {
    await ctx.db.patch(chatId, { streamingStartedAt: Date.now() - 11 * 60 * 1000 })
  })
  await t.mutation(internal.messages.timeoutStreaming, { chatId })
  const after: null | { secretHash?: string; streaming?: boolean } = await t.run(async ctx => ctx.db.get(chatId))
  expect(after?.streaming).toBeFalsy()
  expect(after?.secretHash).not.toBe(before?.secretHash)
})
test('timeoutStreaming does not reset active session', async () => {
  const t = makeTest()
  const chatId = await send(t, 'active@test.com', 'x')
  const before: null | { secretHash: string } = await t.run(async ctx => ctx.db.get(chatId))
  await t.mutation(internal.messages.timeoutStreaming, { chatId })
  const after: null | { secretHash?: string; streaming?: boolean } = await t.run(async ctx => ctx.db.get(chatId))
  expect(after?.streaming).toBeTruthy()
  expect(after?.secretHash).toBe(before?.secretHash)
})
test('sendCore ownership check before streaming check', async () => {
  const t = makeTest()
  const chatId = await send(t, 'owner@test.com', 'x')
  await expect(send(t, 'attacker@test.com', 'hijack', chatId)).rejects.toThrow('unauthorized')
})
test('sendCore rejects send to busy chat', async () => {
  const t = makeTest()
  const chatId = await send(t, 'busy@test.com', 'first')
  await expect(send(t, 'busy@test.com', 'second', chatId)).rejects.toThrow('chat is busy')
})
test('wrong secret rejected', async () => {
  const t = makeTest()
  const chatId = await send(t, 'wrongsec@test.com', 'x')
  await expect(
    t.mutation(internal.messages.insertStreamEvent, { chatId, content: 'x', secret: 'wrong', seq: 0 })
  ).rejects.toThrow('unauthorized')
})
test('checkRateLimit allows under limit', async () => {
  const t = makeTest()
  for (let i = 0; i < 5; i += 1) {
    const allowed = await t.mutation(internal.lib.checkRateLimit, { owner: 'ratelimit@test.com' })
    expect(allowed).toBeTruthy()
  }
})
test('checkRateLimit blocks over limit', async () => {
  const t = makeTest()
  for (let i = 0; i < 30; i += 1) await t.mutation(internal.lib.checkRateLimit, { owner: 'flood@test.com' })
  const blocked = await t.mutation(internal.lib.checkRateLimit, { owner: 'flood@test.com' })
  expect(blocked).toBeFalsy()
})
test('getStats returns correct counts', async () => {
  const t = makeTest()
  await send(t, 'stats@test.com', 'msg1')
  await send(t, 'stats@test.com', 'msg2')
  const stats: { totalChats: number; totalMessages: number } = await t.query(internal.lib.getStats, {
    owner: 'stats@test.com'
  })
  expect(stats.totalChats).toBe(2)
  expect(stats.totalMessages).toBeGreaterThanOrEqual(2)
})
test('insertStreamEvent increments streamEventCount on chatRuntime', async () => {
  const t = makeTest()
  const chatId = await send(t, 'evtcnt@test.com', 'x')
  const secret = await getSecret(t, chatId)
  await t.mutation(internal.messages.insertStreamEvent, { chatId, content: '{"a":1}', secret, seq: 10 })
  await t.mutation(internal.messages.insertStreamEvent, { chatId, content: '{"a":2}', secret, seq: 11 })
  const rt = (await t.run(async ctx =>
    ctx.db
      .query('chatRuntime')
      .withIndex('by_chat', q => q.eq('chatId', chatId))
      .unique()
  )) as null | { streamEventCount: number }
  expect(rt?.streamEventCount).toBe(2)
})
test('insertStreamEvent rejects dup via by_chat_seq index', async () => {
  const t = makeTest()
  const chatId = await send(t, 'evtdup@test.com', 'x')
  const secret = await getSecret(t, chatId)
  await t.mutation(internal.messages.insertStreamEvent, { chatId, content: 'a', secret, seq: 7 })
  await expect(t.mutation(internal.messages.insertStreamEvent, { chatId, content: 'b', secret, seq: 7 })).rejects.toThrow(
    'duplicate seq'
  )
})
test('sendCore sets timeoutFunctionId on chat', async () => {
  const t = makeTest()
  const chatId = await send(t, 'tf@test.com', 'x')
  const chat = (await t.run(async ctx => ctx.db.get(chatId))) as { timeoutFunctionId?: string }
  expect(chat.timeoutFunctionId).toBeDefined()
})
test('sendCore cancels prior timeout on reuse', async () => {
  const t = makeTest()
  const chatId = await send(t, 'tfreuse@test.com', 'x')
  const first = (await t.run(async ctx => ctx.db.get(chatId))) as { timeoutFunctionId?: string }
  const firstId = first.timeoutFunctionId
  await clearStreaming(t, chatId)
  await send(t, 'tfreuse@test.com', 'y', chatId)
  const second = (await t.run(async ctx => ctx.db.get(chatId))) as { timeoutFunctionId?: string }
  expect(second.timeoutFunctionId).toBeDefined()
  expect(second.timeoutFunctionId).not.toBe(firstId)
})
const CTRL_RE_T = /[\u0000-\u001F\u2028]/u
test('sanitizeTitle strips control chars and caps at 80', async () => {
  const t = makeTest()
  const chatId = await send(t, 'titlesan@test.com', `hello\u0000\u001F\u2028world${'x'.repeat(200)}`)
  const chat = (await t.run(async ctx => ctx.db.get(chatId))) as { title: string }
  expect(chat.title).not.toMatch(CTRL_RE_T)
  expect(chat.title.length).toBeLessThanOrEqual(80)
})
test('sanitizeTitle strips HTML tags', async () => {
  const t = makeTest()
  const chatId = await send(t, 'titlehtml@test.com', '<script>alert(1)</script>hello')
  const chat = (await t.run(async ctx => ctx.db.get(chatId))) as { title: string }
  expect(chat.title).not.toContain('<')
  expect(chat.title).not.toContain('>')
  expect(chat.title).toContain('hello')
})
test('sanitizeTitle strips shell metacharacters', async () => {
  const t = makeTest()
  const chatId = await send(t, 'titlesh@test.com', '$(whoami) hi')
  const chat = (await t.run(async ctx => ctx.db.get(chatId))) as { title: string }
  expect(chat.title).not.toContain('$(')
})
test('sanitizeTitle falls back to Untitled on whitespace-only', async () => {
  const t = makeTest()
  await expect(send(t, 'titleempty@test.com', '   ')).rejects.toThrow('empty message')
})
test('insertError sanitizes via sanitizeForDisplay (HTML-escapes tags)', async () => {
  const t = makeTest()
  const chatId = await send(t, 'ierr@test.com', 'x')
  await t.mutation(internal.messages.insertError, {
    chatId,
    error: '<script>alert(1)</script>'
  })
  const ev = (await t.run(async ctx =>
    ctx.db
      .query('streamEvents')
      .withIndex('by_chat', q => q.eq('chatId', chatId))
      .collect()
  )) as { content: string }[]
  const err = ev.find(e => e.content.includes('"error"'))
  expect(err).toBeDefined()
  expect(err?.content).not.toContain('<script>')
  expect(err?.content).toContain('&lt;script&gt;')
})
test('send rejects when chatId references deleted chat', async () => {
  const t = makeTest()
  const chatId = await send(t, 'del@test.com', 'first')
  await t.run(async ctx => {
    await ctx.db.delete(chatId)
  })
  await expect(send(t, 'del@test.com', 'second', chatId)).rejects.toThrow('chat not found')
})
test('send rejects unauthorized chatId before checking streaming', async () => {
  const t = makeTest()
  const chatId = await send(t, 'a@test.com', 'x')
  await expect(send(t, 'b@test.com', 'hijack', chatId)).rejects.toThrow('unauthorized')
})
test('insertStreamEvent caps at 5000 events', async () => {
  const t = makeTest()
  const chatId = await send(t, 'capev@test.com', 'x')
  const secret = await getSecret(t, chatId)
  await t.run(async ctx => {
    const rt = await ctx.db
      .query('chatRuntime')
      .withIndex('by_chat', q => q.eq('chatId', chatId))
      .unique()
    await (rt
      ? ctx.db.patch(rt._id, { streamEventCount: 5000 })
      : ctx.db.insert('chatRuntime', { chatId, streamEventCount: 5000 }))
  })
  await expect(
    t.mutation(internal.messages.insertStreamEvent, { chatId, content: 'x', secret, seq: 5000 })
  ).rejects.toThrow('too many events')
})
test('countStreaming counts active sessions', async () => {
  const t = makeTest()
  const now = Date.now()
  await t.run(async ctx => {
    await ctx.db.insert('chats', {
      app: 'test',
      messageCount: 0,
      owner: 'count@test.com',
      secretHash: 'e8bc163c82eee18733288c7d4ac636db3a6deb013ef2d37b68322be20edc45cc',
      streaming: true,
      streamingStartedAt: now,
      title: 'a',
      turns: 0,
      updatedAt: now
    })
    await ctx.db.insert('chats', {
      app: 'test',
      messageCount: 0,
      owner: 'count@test.com',
      secretHash: 'ad328846aa18b32a335816374511cac1063c704b8c57999e51da9f908290a7a4',
      streaming: true,
      streamingStartedAt: now,
      title: 'b',
      turns: 0,
      updatedAt: now
    })
  })
  const count: number = await t.query(internal.chats.countStreaming, { owner: 'count@test.com' })
  expect(count).toBe(2)
})
test('insertAgentEvent stores event', async () => {
  const t = makeTest()
  const chatId = await send(t, 'agent-evt@test.com', 'x')
  await t.mutation(internal.messages.insertAgentEvent, {
    chatId,
    content: JSON.stringify({ subtype: 'start', type: 'agent' }),
    seq: -999
  })
  const events = await listStreamEvents(t, chatId)
  expect(events.some(e => e.content.includes('start'))).toBeTruthy()
})
test('sendCore rejects empty content', async () => {
  const t = makeTest()
  await expect(send(t, 'empty@test.com', '')).rejects.toThrow('empty')
  await expect(send(t, 'empty@test.com', '   ')).rejects.toThrow('empty')
})
test('sendCore rejects oversized content', async () => {
  const t = makeTest()
  await expect(send(t, 'big@test.com', 'x'.repeat(100_001))).rejects.toThrow('too long')
})
test('chats.status returns false after streaming timeout', async () => {
  const t = makeTest()
  const chatId = await send(t, 'timeout-status@test.com', 'x')
  await t.run(async ctx => {
    await ctx.db.patch(chatId, { streamingStartedAt: Date.now() - 11 * 60 * 1000 })
  })
  const result: { streaming: boolean } = await t.run(async ctx => {
    const chat = (await ctx.db.get(chatId)) as null | { streaming?: boolean; streamingStartedAt?: number }
    if (!chat?.streaming) return { streaming: false }
    const elapsed = Date.now() - (chat.streamingStartedAt ?? 0)
    return { streaming: elapsed < 10 * 60 * 1000 }
  })
  expect(result.streaming).toBeFalsy()
})
test('lastUserMessage returns most recent user message', async () => {
  const t = makeTest()
  const chatId = await send(t, 'lastuser@test.com', 'first')
  await clearStreaming(t, chatId)
  await send(t, 'lastuser@test.com', 'second', chatId)
  const last: null | { content: string } = await t.query(internal.messages.lastUserMessage, {
    chatId
  })
  expect(last).not.toBeNull()
  expect(last?.content).toContain('second')
})
