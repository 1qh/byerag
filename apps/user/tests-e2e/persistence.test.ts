import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test'
import { fresh, killAllSandboxes, listMessages, sendMessage, waitFor } from './helpers'
setDefaultTimeout(5 * 60 * 1000)
beforeAll(async () => {
  await killAllSandboxes()
})
describe('persistence', () => {
  test('reconnect persistence — new client sees messages', async () => {
    const email = fresh()
    const chatId = await sendMessage({ content: 'Persist', email })
    expect(await waitFor(chatId)).toBe(true)
    const msgs = await listMessages(chatId)
    expect(msgs.some(m => m.type === 'assistant')).toBe(true)
  })
  test('persistence — same count and types after re-read', async () => {
    const email = fresh()
    const chatId = await sendMessage({ content: 'Say PERSIST', email })
    await waitFor(chatId)
    const before = await listMessages(chatId)
    const after = await listMessages(chatId)
    expect(after.length).toBe(before.length)
    expect(after.map(m => m.type).join(',')).toBe(before.map(m => m.type).join(','))
  })
  test('two users create independent chats', async () => {
    const email1 = fresh('tab1')
    const email2 = fresh('tab2')
    const c1 = await sendMessage({ content: 'From user 1', email: email1 })
    const c2 = await sendMessage({ content: 'From user 2', email: email2 })
    const msgs1 = await listMessages(c1)
    expect(msgs1.length).toBeGreaterThan(0)
    const msgs2 = await listMessages(c2)
    expect(msgs2.length).toBeGreaterThan(0)
    expect(c1).not.toBe(c2)
  })
})
