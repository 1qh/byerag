import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test'
import { fresh, killAllSandboxes, listMessages, sendMessage, waitFor } from './helpers'
setDefaultTimeout(5 * 60 * 1000)
beforeAll(async () => {
  await killAllSandboxes()
})
describe('ordering', () => {
  test('message seq ordering — sequential, no gaps', async () => {
    const email = fresh()
    const chatId = await sendMessage({ content: 'first', email })
    await waitFor(chatId)
    const msgs = await listMessages(chatId)
    const seqs = msgs.map(m => m.seq).toSorted((a, b) => a - b)
    expect(seqs.length).toBeGreaterThan(0)
    expect(seqs.at(-1) - seqs[0] + 1).toBe(seqs.length)
  })
  test('strict monotonic seq across multi-turn', async () => {
    const email = fresh()
    const chatId = await sendMessage({ content: 'Say 1', email })
    await waitFor(chatId, 1)
    await new Promise<void>(r => {
      setTimeout(r, 1000)
    })
    await sendMessage({ chatId, content: 'Say 2', email })
    await waitFor(chatId, 2)
    const msgs = await listMessages(chatId)
    const seqs = msgs.map(m => m.seq).toSorted((a, b) => a - b)
    for (let i = 1; i < seqs.length; i += 1) expect(seqs[i]).toBe(seqs[i - 1] + 1)
    expect(new Set(seqs).size).toBe(seqs.length)
  })
})
