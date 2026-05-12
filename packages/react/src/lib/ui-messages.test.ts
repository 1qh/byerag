import { describe, expect, test } from 'bun:test'
import type { ChatChunk } from '../parsers/chunks'
import { chunksToMessages } from './ui-messages'
describe('chunksToMessages', () => {
  test('empty → empty', () => {
    expect(chunksToMessages([])).toEqual([])
  })
  test('user-text chunk → UIMessage with text part + role user', () => {
    const chunks: ChatChunk[] = [{ id: 'user-0', kind: 'user-text', text: 'hi' }]
    const msgs = chunksToMessages(chunks)
    expect(msgs).toEqual([{ id: 'user-0', parts: [{ text: 'hi', type: 'text' }], role: 'user' }])
  })
  test('partial chunk → assistant role with text part', () => {
    const chunks: ChatChunk[] = [{ id: 'p-1', kind: 'partial', text: 'streaming...' }]
    expect(chunksToMessages(chunks)).toEqual([
      { id: 'p-1', parts: [{ text: 'streaming...', type: 'text' }], role: 'assistant' }
    ])
  })
  test('agent chunk with only text blocks → assistant message', () => {
    const chunks: ChatChunk[] = [{ blocks: [{ text: 'done', type: 'text' }], id: 'a-1', kind: 'agent', msgMeta: {} }]
    const msgs = chunksToMessages(chunks)
    expect(msgs).toHaveLength(1)
    expect(msgs[0]?.role).toBe('assistant')
  })
  test('mixed order preserved', () => {
    const chunks: ChatChunk[] = [
      { id: 'user-0', kind: 'user-text', text: 'q' },
      { blocks: [{ text: 'a', type: 'text' }], id: 'a-1', kind: 'agent', msgMeta: {} }
    ]
    const msgs = chunksToMessages(chunks)
    expect(msgs.map(m => m.role)).toEqual(['user', 'assistant'])
  })
  test('agent chunk with zero renderable parts → skipped', () => {
    const chunks: ChatChunk[] = [{ blocks: [], id: 'a-empty', kind: 'agent', msgMeta: {} }]
    expect(chunksToMessages(chunks)).toEqual([])
  })
  test('tool_use + tool_result pair: output-available state', () => {
    const chunks: ChatChunk[] = [
      {
        blocks: [
          { id: 'toolu-1', input: { q: 'x' }, name: 'search', type: 'tool_use' },
          { content: 'ok', tool_use_id: 'toolu-1', type: 'tool_result' }
        ] as never,
        id: 'a-1',
        kind: 'agent',
        msgMeta: {}
      }
    ]
    const parts = chunksToMessages(chunks)[0]?.parts ?? []
    const toolPart = parts.find(p => p.type === 'data-tool-x')
    if (toolPart?.type === 'data-tool-x') {
      expect(toolPart.state).toBe('output-available')
      expect(toolPart.toolName).toBe('search')
    } else throw new Error('expected data-tool-x part')
  })
  test('tool_use without result → input-streaming state', () => {
    const chunks: ChatChunk[] = [
      {
        blocks: [{ id: 'toolu-1', input: {}, name: 'search', type: 'tool_use' }] as never,
        id: 'a-1',
        kind: 'agent',
        msgMeta: {}
      }
    ]
    const parts = chunksToMessages(chunks)[0]?.parts ?? []
    const toolPart = parts.find(p => p.type === 'data-tool-x')
    if (toolPart?.type === 'data-tool-x') expect(toolPart.state).toBe('input-streaming')
  })
  test('thinking block → reasoning part', () => {
    const chunks: ChatChunk[] = [
      {
        blocks: [{ thinking: 'pondering', type: 'thinking' }] as never,
        id: 'a-1',
        kind: 'agent',
        msgMeta: {}
      }
    ]
    const parts = chunksToMessages(chunks)[0]?.parts ?? []
    expect(parts[0]?.type).toBe('reasoning')
  })
  test('server_tool_use + web_search_tool_result → data-sources part', () => {
    const chunks: ChatChunk[] = [
      {
        blocks: [
          { id: 'st-1', input: {}, name: 'web_search', type: 'server_tool_use' },
          {
            content: [{ title: 'a', type: 'web_search_result', url: 'https://a' }],
            tool_use_id: 'st-1',
            type: 'web_search_tool_result'
          }
        ] as never,
        id: 'a-1',
        kind: 'agent',
        msgMeta: {}
      }
    ]
    const parts = chunksToMessages(chunks)[0]?.parts ?? []
    expect(parts.find(p => p.type === 'data-sources')).toBeTruthy()
  })
})
