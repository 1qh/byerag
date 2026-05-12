import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test'
import { fresh, killAllSandboxes, sendMessage, waitFor } from './helpers'
setDefaultTimeout(5 * 60 * 1000)
beforeAll(async () => {
  await killAllSandboxes()
})
describe('concurrency', () => {
  test('concurrent sends to same chat rejected (chat is busy)', async () => {
    const email = fresh()
    const chatId = await sendMessage({ content: 'Init', email })
    await expect(sendMessage({ chatId, content: 'Concurrent', email })).rejects.toThrow()
  })
  test('concurrent chats — different chats same user', async () => {
    const email = fresh()
    const [c1, c2] = await Promise.all([sendMessage({ content: 'ONE', email }), sendMessage({ content: 'TWO', email })])
    const [ok1, ok2] = await Promise.all([waitFor(c1), waitFor(c2)])
    expect(ok1 || ok2).toBe(true)
  })
  test('two users simultaneous', async () => {
    const ea = fresh('ua')
    const eb = fresh('ub')
    const [c1, c2] = await Promise.all([
      sendMessage({ content: 'User A', email: ea }),
      sendMessage({ content: 'User B', email: eb })
    ])
    const [okA, okB] = await Promise.all([waitFor(c1), waitFor(c2)])
    expect(okA).toBe(true)
    expect(okB).toBe(true)
  })
  test('sequential multi-turn on two chats', async () => {
    const email = fresh()
    const chatA = await sendMessage({ content: 'Say A1', email })
    const chatB = await sendMessage({ content: 'Say B1', email })
    const [okA1, okB1] = await Promise.all([waitFor(chatA, 1), waitFor(chatB, 1)])
    expect(okA1).toBe(true)
    expect(okB1).toBe(true)
    await sendMessage({ chatId: chatA, content: 'A2', email })
    await sendMessage({ chatId: chatB, content: 'B2', email })
    const [okA2, okB2] = await Promise.all([waitFor(chatA, 2), waitFor(chatB, 2)])
    expect(okA2).toBe(true)
    expect(okB2).toBe(true)
  })
  test('10 concurrent writes from different users', async () => {
    const emails = Array.from({ length: 10 }, (_, i) => fresh(`stress${i}`))
    const chatIds = await Promise.all(emails.map(async email => sendMessage({ content: 'msg', email })))
    expect(chatIds.every(id => typeof id === 'string')).toBe(true)
    expect(new Set(chatIds.map(String)).size).toBe(10)
  })
})
