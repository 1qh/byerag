import { describe, expect, test } from 'bun:test'
import type { RawEvent } from './chunks'
import { chunksToMessages } from '../lib/ui-messages'
import { sourceToChunks } from './chunks'

const streamEvent = (id: string, seq: number, eventObj: unknown): RawEvent =>
  ({
    _creationTime: 1000 + seq,
    _id: id,
    content: JSON.stringify({ event: eventObj, type: 'stream_event' })
  }) as RawEvent
const userMsg = (id: string, text: string): RawEvent => ({
  _id: id,
  content: JSON.stringify({ message: { content: [{ text, type: 'text' }], role: 'user' }, type: 'user' })
})
const completedAssistant = (id: string, msgId: string, text: string): RawEvent => ({
  _id: id,
  content: JSON.stringify({
    message: { content: [{ text, type: 'text' }], id: msgId, role: 'assistant' },
    type: 'assistant'
  })
})
describe('stream pipeline: user → deltas → completed message', () => {
  test('in-flight deltas assemble into partial; completed message supersedes', () => {
    const events: RawEvent[] = [
      userMsg('u1', 'ping'),
      streamEvent('s1', 1, { message: { id: 'msg-1' }, type: 'message_start' }),
      streamEvent('s2', 2, { content_block: { text: '', type: 'text' }, index: 0, type: 'content_block_start' }),
      streamEvent('s3', 3, { delta: { text: 'hel', type: 'text_delta' }, index: 0, type: 'content_block_delta' }),
      streamEvent('s4', 4, { delta: { text: 'lo', type: 'text_delta' }, index: 0, type: 'content_block_delta' })
    ]
    const midChunks = sourceToChunks(events)
    const midMsgs = chunksToMessages(midChunks)
    const assistantMid = midMsgs.find(m => m.role === 'assistant')
    expect(assistantMid?.parts.find(p => p.type === 'text')).toEqual({ text: 'hello', type: 'text' })
    const withDone = [...events, completedAssistant('a1', 'msg-1', 'hello')]
    const finalChunks = sourceToChunks(withDone)
    const finalMsgs = chunksToMessages(finalChunks)
    const partials = finalChunks.filter(c => c.kind === 'partial')
    expect(partials).toHaveLength(0)
    const assistantFinal = finalMsgs.find(m => m.role === 'assistant')
    expect(assistantFinal?.parts[0]).toEqual({ text: 'hello', type: 'text' })
    expect(finalMsgs.map(m => m.role)).toEqual(['user', 'assistant'])
  })
  test('thinking block + text block across one stream assembles both in order', () => {
    const events: RawEvent[] = [
      userMsg('u1', 'think then answer'),
      streamEvent('s1', 1, { message: { id: 'msg-2' }, type: 'message_start' }),
      streamEvent('s2', 2, { content_block: { thinking: '', type: 'thinking' }, index: 0, type: 'content_block_start' }),
      streamEvent('s3', 3, {
        delta: { thinking: 'pondering', type: 'thinking_delta' },
        index: 0,
        type: 'content_block_delta'
      }),
      streamEvent('s4', 4, { content_block: { text: '', type: 'text' }, index: 1, type: 'content_block_start' }),
      streamEvent('s5', 5, { delta: { text: 'done.', type: 'text_delta' }, index: 1, type: 'content_block_delta' })
    ]
    const chunks = sourceToChunks(events)
    const msgs = chunksToMessages(chunks)
    const assistant = msgs.find(m => m.role === 'assistant')
    const partials = chunks.filter(c => c.kind === 'partial')
    expect(partials.length).toBeGreaterThan(0)
    expect(assistant?.parts.length).toBeGreaterThan(0)
  })
})
