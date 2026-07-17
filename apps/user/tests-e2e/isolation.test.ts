import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test'
import { fresh, killAllSandboxes, listChats, listMessages, removeChat, sendMessage } from './helpers'

setDefaultTimeout(5 * 60 * 1000)
beforeAll(async () => {
  await killAllSandboxes()
})
describe('isolation', () => {
  test('identity isolation — users only see own chats', async () => {
    const userA = fresh('a')
    const userB = fresh('b')
    await sendMessage({ content: 'alice', email: userA })
    await sendMessage({ content: 'bob', email: userB })
    const chatsA = await listChats(userA)
    const chatsB = await listChats(userB)
    expect(chatsA).toHaveLength(1)
    expect(chatsB).toHaveLength(1)
    expect(chatsA[0]?.owner).toBe(userA)
    expect(chatsB[0]?.owner).toBe(userB)
  })
  test('delete chat — ownership enforced', async () => {
    const owner = fresh('own')
    const attacker = fresh('atk')
    const chatId = await sendMessage({ content: 'protected', email: owner })
    await removeChat(attacker, chatId)
    const chats = await listChats(owner)
    expect(chats).toHaveLength(1)
  })
  test('two chats — messages isolated', async () => {
    const email = fresh()
    const c1 = await sendMessage({ content: 'chat one', email })
    const c2 = await sendMessage({ content: 'chat two', email })
    const msgs1 = await listMessages(c1)
    const msgs2 = await listMessages(c2)
    expect(msgs1.length).toBeGreaterThan(0)
    expect(msgs2.length).toBeGreaterThan(0)
    const ids1 = new Set(msgs1.map(m => String(m._id)))
    expect(msgs2.every(m => !ids1.has(String(m._id)))).toBe(true)
  })
  test("send to other user's chat rejected", async () => {
    const owner = fresh('own')
    const chatId = await sendMessage({ content: 'mine', email: owner })
    await expect(sendMessage({ chatId, content: 'hijack', email: fresh('atk') })).rejects.toThrow()
  })
})
