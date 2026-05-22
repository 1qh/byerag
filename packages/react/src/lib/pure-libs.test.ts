import { describe, expect, test } from 'bun:test'
import { arrayBufferToBase64, base64ToBytes } from './binary'
import { groupByTime } from './chat-grouping'
import { errorMessage } from './error-message'
import { flagEmoji } from './flag'

const DAY = 24 * 60 * 60 * 1000
describe('groupByTime', () => {
  test('buckets chats by age + orders newest first within bucket', () => {
    const now = 10 * DAY
    const chats = [
      { _id: 'a', updatedAt: now - 100 },
      { _id: 'b', updatedAt: now - DAY - 100 },
      { _id: 'c', updatedAt: now - 3 * DAY },
      { _id: 'd', updatedAt: now - 30 * DAY }
    ]
    const groups = groupByTime(chats, now)
    expect(groups.map(g => g.label)).toEqual(['Today', 'Yesterday', 'Previous 7 days', 'Older'])
    expect(groups[0]?.chats.map(c => c._id)).toEqual(['a'])
    expect(groups[3]?.chats.map(c => c._id)).toEqual(['d'])
  })
  test('skips empty buckets', () => {
    const now = DAY * 10
    const groups = groupByTime([{ _id: 'x', updatedAt: now - 100 }], now)
    expect(groups.map(g => g.label)).toEqual(['Today'])
  })
})
describe('flagEmoji', () => {
  test('returns regional indicator emoji for valid iso2', () => {
    expect(flagEmoji('US')).toBe('🇺🇸')
    expect(flagEmoji('vn')).toBe('🇻🇳')
  })
  test('empty string for invalid inputs', () => {
    expect(flagEmoji('')).toBe('')
    expect(flagEmoji('USA')).toBe('')
    expect(flagEmoji(undefined)).toBe('')
    expect(flagEmoji('1!')).toBe('')
  })
})
describe('errorMessage', () => {
  test('extracts .message from Error', () => {
    expect(errorMessage(new Error('bad'))).toBe('bad')
  })
  test('extracts .data when present', () => {
    expect(errorMessage({ data: 'shape' })).toBe('shape')
  })
  test('falls back to String() for unknowns', () => {
    expect(errorMessage(42)).toBe('42')
    expect(errorMessage(null)).toBe('null')
  })
})
describe('binary', () => {
  test('arrayBufferToBase64 roundtrip via base64ToBytes', () => {
    const buf = new TextEncoder().encode('hello world').buffer
    const b64 = arrayBufferToBase64(buf)
    const bytes = base64ToBytes(b64)
    expect(new TextDecoder().decode(bytes)).toBe('hello world')
  })
  test('handles empty buffer', () => {
    expect(arrayBufferToBase64(new ArrayBuffer(0))).toBe('')
  })
})
