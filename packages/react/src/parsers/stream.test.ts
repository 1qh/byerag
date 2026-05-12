import { describe, expect, test } from 'bun:test'
import { parseMessage, parseStreamEvent } from './stream'
describe('parseMessage', () => {
  test('returns single text block for garbage string', () => {
    expect(parseMessage('not json')).toEqual({ blocks: [{ text: 'not json', type: 'text' }], type: 'unknown' })
  })
  test('parses SDK envelope (type + message.content)', () => {
    const raw = JSON.stringify({
      message: { content: [{ text: 'hi', type: 'text' }], role: 'user' },
      type: 'user'
    })
    const out = parseMessage(raw)
    expect(out.type).toBe('user')
    expect(out.blocks).toEqual([{ text: 'hi', type: 'text' }])
  })
  test('parses raw envelope (role + content)', () => {
    const raw = JSON.stringify({ content: [{ text: 'bye', type: 'text' }], role: 'assistant' })
    const out = parseMessage(raw)
    expect(out.type).toBe('assistant')
    expect(out.blocks).toEqual([{ text: 'bye', type: 'text' }])
  })
  test('preserves unknown block fields (permissive schema)', () => {
    const raw = JSON.stringify({
      message: { content: [{ tool_use_id: 'toolabc', type: 'tool_result' }], role: 'user' },
      type: 'user'
    })
    const out = parseMessage(raw)
    expect(out.blocks[0]).toMatchObject({ tool_use_id: 'toolabc', type: 'tool_result' })
  })
})
describe('parseStreamEvent', () => {
  test('null on malformed json', () => {
    expect(parseStreamEvent('not json')).toBe(null)
  })
  test('parses a system event', () => {
    const raw = JSON.stringify({ subtype: 'status', type: 'system', uuid: 'u1' })
    const out = parseStreamEvent(raw)
    expect(out).not.toBe(null)
    expect(out?.type).toBe('system')
  })
  test('parses an assistant event with content array', () => {
    const raw = JSON.stringify({
      message: { content: [{ text: 'hello', type: 'text' }], id: 'm1', role: 'assistant' },
      type: 'assistant',
      uuid: 'u2'
    })
    const out = parseStreamEvent(raw)
    expect(out?.type).toBe('assistant')
  })
  test('parses an error event', () => {
    const raw = JSON.stringify({ error: 'boom', type: 'error' })
    const out = parseStreamEvent(raw)
    expect(out?.type).toBe('error')
  })
})
