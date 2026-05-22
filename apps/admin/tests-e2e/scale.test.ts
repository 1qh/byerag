import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test'
import { fresh, killAllSandboxes, listMessages, sendMessage, waitFor } from './helpers'

setDefaultTimeout(5 * 60 * 1000)
beforeAll(async () => {
  await killAllSandboxes()
})
describe('scale', () => {
  test('3 chats per user get unique IDs', async () => {
    const email = fresh()
    const ids: string[] = []
    for (let i = 0; i < 3; i += 1) ids.push(await sendMessage({ content: `Chat ${i}`, email }))
    expect(new Set(ids.map(String)).size).toBe(3)
  })
  test('connection durability — 50 reads on same chat', async () => {
    const email = fresh()
    const chatId = await sendMessage({ content: 'init', email })
    for (let i = 0; i < 50; i += 1) await listMessages(chatId)
  })
  test('rapid chat switching — 10 alternating reads', async () => {
    const email = fresh()
    const c1 = await sendMessage({ content: 'Switch 1', email })
    await waitFor(c1)
    const c2 = await sendMessage({ content: 'Switch 2', email })
    await waitFor(c2)
    for (let i = 0; i < 10; i += 1) {
      const msgs = await listMessages(i % 2 === 0 ? c1 : c2)
      expect(msgs.length).toBeGreaterThan(0)
    }
  })
  test('data integrity — unique IDs and valid messages', async () => {
    const email = fresh()
    const chatId = await sendMessage({ content: 'x', email })
    await waitFor(chatId)
    const msgs = await listMessages(chatId)
    const ids = msgs.map(m => String(m._id))
    expect(new Set(ids).size).toBe(ids.length)
    expect(msgs.length).toBeGreaterThan(0)
  })
})
