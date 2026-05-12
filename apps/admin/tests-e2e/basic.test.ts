import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test'
import { blocks, fresh, killAllSandboxes, listMessages, listStreamEvents, sendMessage, waitFor } from './helpers'
setDefaultTimeout(5 * 60 * 1000)
beforeAll(async () => {
  await killAllSandboxes()
})
describe('basic', () => {
  test('single message', async () => {
    const email = fresh()
    const chatId = await sendMessage({ content: 'Say hi', email })
    const ok = await waitFor(chatId)
    expect(ok).toBe(true)
    const msgs = await listMessages(chatId)
    expect(msgs.some(m => m.type === 'user')).toBe(true)
    expect(msgs.some(m => m.type === 'assistant')).toBe(true)
    const events = await listStreamEvents(chatId)
    expect(events.length).toBeGreaterThan(0)
    const aMsgs = msgs.filter(m => m.type === 'assistant')
    expect(aMsgs.some(m => blocks(m).some(b => b.type === 'text' && (b.text?.length ?? 0) > 0))).toBe(true)
  })
  test('multi-turn', async () => {
    const email = fresh()
    const chatId = await sendMessage({ content: 'Remember: BANANA', email })
    expect(await waitFor(chatId, 1)).toBe(true)
    await sendMessage({ chatId, content: 'What word?', email })
    expect(await waitFor(chatId, 2)).toBe(true)
    const msgs = await listMessages(chatId)
    expect(msgs.filter(m => m.type === 'user').length).toBeGreaterThanOrEqual(2)
    expect(msgs.filter(m => m.type === 'assistant').length).toBeGreaterThanOrEqual(2)
  })
  test('unicode and emoji', async () => {
    const email = fresh()
    const chatId = await sendMessage({ content: 'Repeat exactly: 你好世界 🎉 café', email })
    expect(await waitFor(chatId)).toBe(true)
    const msgs = await listMessages(chatId)
    expect(msgs.some(m => m.type === 'user')).toBe(true)
  })
  test('long message', async () => {
    const email = fresh()
    const chatId = await sendMessage({ content: `Repeat 'test'. ${'x'.repeat(300)}`, email })
    expect(await waitFor(chatId)).toBe(true)
  })
  test('special chars', async () => {
    const email = fresh()
    const chatId = await sendMessage({ content: 'Say: <script>alert("injection")</script>', email })
    expect(await waitFor(chatId)).toBe(true)
  })
  test('adminmal content', async () => {
    const email = fresh()
    const chatId = await sendMessage({ content: 'hi', email })
    expect(await waitFor(chatId)).toBe(true)
  })
  test('5KB content stored intact', async () => {
    const email = fresh()
    const content = `${'x'.repeat(5000)} — say OK`
    const chatId = await sendMessage({ content, email })
    expect(await waitFor(chatId)).toBe(true)
    const msgs = await listMessages(chatId)
    const userMsg = msgs.find(m => m.type === 'user')
    const parsed: { content?: { text?: string }[]; message?: { content?: { text?: string }[] } } = JSON.parse(
      userMsg?.content ?? '{}'
    ) as { content?: { text?: string }[]; message?: { content?: { text?: string }[] } }
    const text: string = parsed.message?.content?.[0]?.text ?? parsed.content?.[0]?.text ?? ''
    expect(text.length).toBeGreaterThanOrEqual(5000)
  })
  test('tool use', async () => {
    const email = fresh()
    const chatId = await sendMessage({
      content: 'Run: echo $((42+58)). You MUST use Bash.',
      email
    })
    expect(await waitFor(chatId)).toBe(true)
  })
})
