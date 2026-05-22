/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test'
import { blocks, fresh, killAllSandboxes, listMessages, listStreamEvents, sendMessage, waitFor } from './helpers'

setDefaultTimeout(5 * 60 * 1000)
beforeAll(async () => {
  await killAllSandboxes()
})
describe('streaming', () => {
  test('stream events persist after completion', async () => {
    const email = fresh()
    const chatId = await sendMessage({ content: 'x', email })
    await waitFor(chatId)
    await new Promise<void>(r => {
      setTimeout(r, 2000)
    })
    const events = await listStreamEvents(chatId)
    expect(events.length).toBeGreaterThan(0)
  })
  test('content block parity — has text blocks', async () => {
    const email = fresh()
    const chatId = await sendMessage({ content: 'Say OK', email })
    await waitFor(chatId)
    const msgs = await listMessages(chatId)
    const aMsgs = msgs.filter(m => m.type === 'assistant')
    expect(aMsgs.some(m => blocks(m).some(b => b.type === 'text'))).toBe(true)
  })
  test('JSON content integrity', async () => {
    const email = fresh()
    const chatId = await sendMessage({ content: 'Say OK', email })
    await waitFor(chatId)
    const msgs = await listMessages(chatId)
    for (const m of msgs) {
      const p: { content?: unknown[]; message?: { content?: unknown[] } } = JSON.parse(m.content) as {
        content?: unknown[]
        message?: { content?: unknown[] }
      }
      const b = p.message?.content || p.content
      expect(Array.isArray(b)).toBe(true)
    }
  })
})
