import type { StreamEvent } from 'backend/convex/streamProtocol'
import { describe, expect, test } from 'bun:test'
import { applyDelta, assemblePartials, messageIdFromStart, startBlock } from './partials'
const wrap = (event: unknown, id: string): { _id: string; e: StreamEvent } =>
  ({ _id: id, e: { event, type: 'stream_event', uuid: id } }) as unknown as { _id: string; e: StreamEvent }
describe('startBlock', () => {
  test('extracts block index + kind from content_block_start', () => {
    const out = startBlock({ content_block: { text: '', type: 'text' }, index: 2, type: 'content_block_start' })
    expect(out).toEqual({ acc: '', blockIndex: 2, kind: 'text' })
  })
  test('returns null if content_block missing', () => {
    expect(startBlock({ index: 0, type: 'content_block_start' })).toBe(null)
  })
})
describe('applyDelta', () => {
  test('accumulates text_delta', () => {
    const block = { acc: '', blockIndex: 0, kind: 'text' }
    applyDelta(block, { delta: { text: 'hello ', type: 'text_delta' } })
    applyDelta(block, { delta: { text: 'world', type: 'text_delta' } })
    expect(block.acc).toBe('hello world')
  })
  test('accumulates thinking_delta', () => {
    const block = { acc: '', blockIndex: 0, kind: 'thinking' }
    applyDelta(block, { delta: { thinking: 'reason', type: 'thinking_delta' } })
    expect(block.acc).toBe('reason')
  })
  test('accumulates partial_json for input_json_delta', () => {
    const block = { acc: '', blockIndex: 0, kind: 'tool_use' }
    applyDelta(block, { delta: { partial_json: '{"a":', type: 'input_json_delta' } })
    applyDelta(block, { delta: { partial_json: '1}', type: 'input_json_delta' } })
    expect(block.acc).toBe('{"a":1}')
  })
  test('skips non-string delta fields (e.g. signature)', () => {
    const block = { acc: '', blockIndex: 0, kind: 'thinking' }
    applyDelta(block, { delta: { signature: 'sig123', type: 'signature_delta' } })
    expect(block.acc).toBe('')
  })
})
describe('messageIdFromStart', () => {
  test('extracts id', () => {
    expect(messageIdFromStart({ message: { id: 'msg_1' }, type: 'message_start' })).toBe('msg_1')
  })
  test('null if missing', () => {
    expect(messageIdFromStart({ type: 'message_start' })).toBe(null)
  })
})
describe('assemblePartials', () => {
  test('empty input → empty output', () => {
    expect(assemblePartials([], new Map())).toEqual([])
  })
  test('accumulates a text block across deltas', () => {
    const events = [
      wrap({ message: { id: 'm1' }, type: 'message_start' }, 'e1'),
      wrap({ content_block: { text: '', type: 'text' }, index: 0, type: 'content_block_start' }, 'e2'),
      wrap({ delta: { text: 'hi ', type: 'text_delta' }, index: 0, type: 'content_block_delta' }, 'e3'),
      wrap({ delta: { text: 'there', type: 'text_delta' }, index: 0, type: 'content_block_delta' }, 'e4')
    ]
    const out = assemblePartials(events, new Map())
    expect(out).toHaveLength(1)
    expect(out[0]?.blocks).toHaveLength(1)
    expect(out[0]?.blocks[0]?.acc).toBe('hi there')
  })
  test('filters completed blocks via completedBlockCountByMsg', () => {
    const events = [
      wrap({ message: { id: 'm1' }, type: 'message_start' }, 'e1'),
      wrap({ content_block: { text: '', type: 'text' }, index: 0, type: 'content_block_start' }, 'e2'),
      wrap({ delta: { text: 'done block', type: 'text_delta' }, index: 0, type: 'content_block_delta' }, 'e3'),
      wrap({ content_block: { text: '', type: 'text' }, index: 1, type: 'content_block_start' }, 'e4'),
      wrap({ delta: { text: 'live block', type: 'text_delta' }, index: 1, type: 'content_block_delta' }, 'e5')
    ]
    const out = assemblePartials(events, new Map([['m1', 1]]))
    expect(out).toHaveLength(1)
    expect(out[0]?.blocks).toHaveLength(1)
    expect(out[0]?.blocks[0]?.blockIndex).toBe(1)
    expect(out[0]?.blocks[0]?.acc).toBe('live block')
  })
  test('buckets separated by message_start', () => {
    const events = [
      wrap({ message: { id: 'm1' }, type: 'message_start' }, 'e1'),
      wrap({ content_block: { text: '', type: 'text' }, index: 0, type: 'content_block_start' }, 'e2'),
      wrap({ delta: { text: 'a', type: 'text_delta' }, index: 0, type: 'content_block_delta' }, 'e3'),
      wrap({ message: { id: 'm2' }, type: 'message_start' }, 'e4'),
      wrap({ content_block: { text: '', type: 'text' }, index: 0, type: 'content_block_start' }, 'e5'),
      wrap({ delta: { text: 'b', type: 'text_delta' }, index: 0, type: 'content_block_delta' }, 'e6')
    ]
    const out = assemblePartials(events, new Map())
    expect(out).toHaveLength(2)
    expect(out[0]?.blocks[0]?.acc).toBe('a')
    expect(out[1]?.blocks[0]?.acc).toBe('b')
  })
})
