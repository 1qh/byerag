import { describe, expect, test } from 'bun:test'
import { activeMentionAt, parseMentions } from './use-mention-parser'
describe('parseMentions', () => {
  test('extracts kind:name tokens', () => {
    expect.hasAssertions()
    const text = 'send @template:cold to @collection:germany-q2 except @bookmark:dnc'
    expect(parseMentions(text).map(m => `${m.kind}:${m.name}`)).toStrictEqual([
      'template:cold',
      'collection:germany-q2',
      'bookmark:dnc'
    ])
  })
  test('accepts @me singleton without colon', () => {
    expect.hasAssertions()
    expect(parseMentions('@me set timezone Asia/Saigon').map(m => m.kind)).toStrictEqual(['me'])
  })
  test('skips bare @kind without colon (non-singleton)', () => {
    expect.hasAssertions()
    expect(parseMentions('@collection foo bar')).toHaveLength(0)
  })
  test('handles email-shaped contact name', () => {
    expect.hasAssertions()
    expect(parseMentions('@contact:hans@acme.de').map(m => m.name)).toStrictEqual(['hans@acme.de'])
  })
})
describe('activeMentionAt', () => {
  test('detects bare @ start', () => {
    expect.hasAssertions()
    const r = activeMentionAt('hello @', 7)
    expect(r?.kindFragment).toBe('')
    expect(r?.nameFragment).toBeNull()
  })
  test('detects partial kind', () => {
    expect.hasAssertions()
    const r = activeMentionAt('hello @temp', 11)
    expect(r?.kindFragment).toBe('temp')
    expect(r?.nameFragment).toBeNull()
  })
  test('detects kind:name partial', () => {
    expect.hasAssertions()
    const r = activeMentionAt('hello @template:cold', 20)
    expect(r?.kindFragment).toBe('template')
    expect(r?.nameFragment).toBe('cold')
  })
  test('returns null mid-word (@ not preceded by space/start)', () => {
    expect.hasAssertions()
    expect(activeMentionAt('email me@host', 13)).toBeNull()
  })
  test('returns null when whitespace between @ and cursor', () => {
    expect.hasAssertions()
    expect(activeMentionAt('hello @temp foo', 15)).toBeNull()
  })
  test('detects at start of string', () => {
    expect.hasAssertions()
    const r = activeMentionAt('@col', 4)
    expect(r?.start).toBe(0)
    expect(r?.kindFragment).toBe('col')
  })
})
