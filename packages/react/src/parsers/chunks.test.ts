import { describe, expect, test } from 'bun:test'
import type { RawEvent } from './chunks'
import { sourceToChunks } from './chunks'
const userEvent = (id: string, text: string): RawEvent => ({
  _id: id,
  content: JSON.stringify({ message: { content: [{ text, type: 'text' }], role: 'user' }, type: 'user' })
})
const assistantEvent = (id: string, blocks: { text?: string; type: string }[]): RawEvent => ({
  _id: id,
  content: JSON.stringify({
    message: { content: blocks, id: `msg-${id}`, role: 'assistant' },
    type: 'assistant'
  })
})
const errorEvent = (id: string, err: string): RawEvent => ({
  _id: id,
  content: JSON.stringify({ error: err, type: 'error' })
})
describe('sourceToChunks', () => {
  test('empty input → empty output', () => {
    expect(sourceToChunks([])).toEqual([])
  })
  test('user-text chunk keyed by position (user-0), not by _id', () => {
    const [chunk] = sourceToChunks([userEvent('opt-123', 'hello')])
    expect(chunk?.kind).toBe('user-text')
    expect(chunk?.id).toBe('user-0')
  })
  test('two user-text chunks get user-0 and user-1 (stable across optimistic→real swap)', () => {
    const optimistic = sourceToChunks([userEvent('opt-1', 'first'), userEvent('opt-2', 'second')])
    const real = sourceToChunks([userEvent('convex-id-x', 'first'), userEvent('convex-id-y', 'second')])
    expect(optimistic.map(c => c.id)).toEqual(['user-0', 'user-1'])
    expect(real.map(c => c.id)).toEqual(['user-0', 'user-1'])
  })
  test('user with non-text content falls through to agent branch', () => {
    const raw: RawEvent = {
      _id: 'e1',
      content: JSON.stringify({
        message: { content: [{ tool_use_id: 'tu1', type: 'tool_result' }], role: 'user' },
        type: 'user'
      })
    }
    const chunks = sourceToChunks([raw])
    expect(chunks[0]?.kind).toBe('agent')
  })
  test('assistant event with blocks becomes an agent chunk', () => {
    const chunks = sourceToChunks([assistantEvent('a1', [{ text: 'ok', type: 'text' }])])
    expect(chunks).toHaveLength(1)
    expect(chunks[0]?.kind).toBe('agent')
  })
  test('error event becomes a agent chunk with error text block', () => {
    const chunks = sourceToChunks([errorEvent('e1', 'network down')])
    expect(chunks[0]?.kind).toBe('agent')
    expect((chunks[0] as { blocks: { text: string; type: string }[] }).blocks[0]?.text).toContain('network down')
  })
  test('mixed user + assistant preserves order', () => {
    const chunks = sourceToChunks([userEvent('u1', 'q'), assistantEvent('a1', [{ text: 'a', type: 'text' }])])
    expect(chunks.map(c => c.kind)).toEqual(['user-text', 'agent'])
  })
})
