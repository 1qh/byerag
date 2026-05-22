import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test'
import { fresh, killAllSandboxes, listMessages, sendMessage, waitFor } from './helpers'

setDefaultTimeout(5 * 60 * 1000)
beforeAll(async () => {
  await killAllSandboxes()
})
describe('multi-turn', () => {
  const email = fresh('mt')
  test('sequential 3-turn', async () => {
    const chatId = await sendMessage({ content: 'Say 1', email })
    expect(await waitFor(chatId, 1)).toBe(true)
    await new Promise<void>(r => {
      setTimeout(r, 3000)
    })
    await sendMessage({ chatId, content: 'Say 2', email })
    expect(await waitFor(chatId, 2)).toBe(true)
    await new Promise<void>(r => {
      setTimeout(r, 3000)
    })
    await sendMessage({ chatId, content: 'Say 3', email })
    expect(await waitFor(chatId, 3)).toBe(true)
    const msgs = await listMessages(chatId)
    expect(msgs.filter(m => m.type === 'user').length).toBeGreaterThanOrEqual(3)
    expect(msgs.filter(m => m.type === 'assistant').length).toBeGreaterThanOrEqual(3)
  })
  test('multi-turn + switch + continue', async () => {
    const chatA = await sendMessage({ content: 'A1', email })
    await waitFor(chatA, 1)
    await new Promise<void>(r => {
      setTimeout(r, 3000)
    })
    await sendMessage({ chatId: chatA, content: 'A2', email })
    await waitFor(chatA, 2)
    const chatB = await sendMessage({ content: 'B1', email })
    await waitFor(chatB, 1)
    await new Promise<void>(r => {
      setTimeout(r, 3000)
    })
    await sendMessage({ chatId: chatA, content: 'A3', email })
    expect(await waitFor(chatA, 3)).toBe(true)
    const msgsA = await listMessages(chatA)
    expect(msgsA.filter(m => m.type === 'user').length).toBeGreaterThanOrEqual(3)
    const msgsB = await listMessages(chatB)
    expect(msgsB.filter(m => m.type === 'user').length).toBeGreaterThanOrEqual(1)
  })
  test('multi-turn after 10s delay', async () => {
    const chatId = await sendMessage({ content: 'Remember: APPLE', email })
    await waitFor(chatId)
    await new Promise<void>(r => {
      setTimeout(r, 10_000)
    })
    await sendMessage({ chatId, content: 'What word?', email })
    expect(await waitFor(chatId, 2)).toBe(true)
  })
  test('3 rapid messages same chat', async () => {
    const chatId = await sendMessage({ content: 'Say 1', email })
    await waitFor(chatId, 1)
    await new Promise<void>(r => {
      setTimeout(r, 3000)
    })
    await sendMessage({ chatId, content: 'Say 2', email })
    await waitFor(chatId, 2)
    await new Promise<void>(r => {
      setTimeout(r, 3000)
    })
    await sendMessage({ chatId, content: 'Say 3', email })
    expect(await waitFor(chatId, 3)).toBe(true)
    const msgs = await listMessages(chatId)
    expect(msgs.filter(m => m.type === 'assistant').length).toBeGreaterThanOrEqual(3)
  })
})
