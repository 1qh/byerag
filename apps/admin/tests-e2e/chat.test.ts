import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test'
import { fresh, killAllSandboxes, listChats, listMessages, removeChat, sendMessage, waitFor } from './helpers'

setDefaultTimeout(5 * 60 * 1000)
beforeAll(async () => {
  await killAllSandboxes()
})
describe('chat', () => {
  test('title truncated to 80 chars', async () => {
    const email = fresh()
    await sendMessage({ content: 'A'.repeat(200), email })
    const chats = await listChats(email)
    expect(chats[0]?.title.length).toBeLessThanOrEqual(80)
  })
  test('sidebar has multiple chats with timestamps', async () => {
    const email = fresh()
    await sendMessage({ content: 'First', email })
    await sendMessage({ content: 'Second', email })
    const chats = await listChats(email)
    expect(chats).toHaveLength(2)
    for (const c of chats) expect(c.updatedAt).toBeGreaterThan(0)
  })
  test('sidebar sorted newest first', async () => {
    const email = fresh()
    await sendMessage({ content: 'First', email })
    await sendMessage({ content: 'Second', email })
    const chats = await listChats(email)
    expect((chats[0]?.updatedAt ?? 0) >= (chats[1]?.updatedAt ?? 0)).toBe(true)
  })
  test('sidebar reorders on new message', async () => {
    const email = fresh()
    const c1 = await sendMessage({ content: 'First chat', email })
    await waitFor(c1)
    const c2 = await sendMessage({ content: 'Second chat', email })
    await waitFor(c2)
    await new Promise<void>(r => {
      setTimeout(r, 1000)
    })
    await sendMessage({ chatId: c1, content: 'Bump', email })
    const chats = await listChats(email)
    expect(chats[0]?.title).toBe('First chat')
  })
  test('back-to-back new chats get unique IDs', async () => {
    const email = fresh()
    const ids: string[] = []
    for (let i = 0; i < 3; i += 1) ids.push(await sendMessage({ content: `Chat ${i}`, email }))
    expect(new Set(ids.map(String)).size).toBe(3)
  })
  test('delete chat removes it', async () => {
    const email = fresh()
    const chatId = await sendMessage({ content: 'x', email })
    await removeChat(email, chatId)
    const chats = await listChats(email)
    expect(chats).toHaveLength(0)
  })
  test('non-existent chat returns empty messages', async () => {
    const email = fresh()
    const chatId = await sendMessage({ content: 'x', email })
    await removeChat(email, chatId)
    const msgs = await listMessages(chatId)
    expect(msgs).toHaveLength(0)
  })
  test('new chat after delete', async () => {
    const email = fresh()
    const c1 = await sendMessage({ content: 'Old', email })
    await removeChat(email, c1)
    const c2 = await sendMessage({ content: 'New', email })
    expect(c1).not.toBe(c2)
  })
  test('empty content rejected', async () => {
    await expect(sendMessage({ content: '', email: fresh() })).rejects.toThrow()
  })
})
