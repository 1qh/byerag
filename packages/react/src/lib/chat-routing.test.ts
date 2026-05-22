import type { Id } from 'backend/convex/_generated/dataModel'
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PendingText } from './chat-state'
import { filterLivePending, routeChatId, validCreatedChatId } from './chat-state'

const CHAT_A = 'chat-a' as Id<'chats'>
const CHAT_B = 'chat-b' as Id<'chats'>
describe('routeChatId', () => {
  test('extracts id from /chat/<id>', () => {
    expect(routeChatId('/chat/abc123')).toBe('abc123')
  })
  test('returns null for non-chat path', () => {
    expect(routeChatId('/settings')).toBeNull()
  })
  test('returns null for null pathname', () => {
    expect(routeChatId(null)).toBeNull()
  })
  test('strips query / hash', () => {
    expect(routeChatId('/chat/xyz?ref=1#top')).toBe('xyz')
  })
  test('handles nested segments', () => {
    expect(routeChatId('/chat/abc/sub')).toBe('abc')
  })
})
describe('validCreatedChatId — flicker guard', () => {
  test('returns id when pathname matches the created chat', () => {
    expect(validCreatedChatId(CHAT_A, '/chat/chat-a')).toBe(CHAT_A)
  })
  test('returns null when pathname has not yet caught up to created chat', () => {
    expect(validCreatedChatId(CHAT_A, '/')).toBeNull()
  })
  test('returns null when pathname is for a different chat', () => {
    expect(validCreatedChatId(CHAT_A, '/chat/chat-b')).toBeNull()
  })
  test('returns null when no created chat', () => {
    expect(validCreatedChatId(null, '/chat/chat-a')).toBeNull()
  })
})
describe('filterLivePending — Thinking-forever guard', () => {
  const pending: PendingText[] = [
    { chatId: CHAT_A, text: 'hello' },
    { chatId: CHAT_A, text: 'world' },
    { chatId: CHAT_B, text: 'unrelated' }
  ]
  test('drops pending for active chat once raw query echoes the text', () => {
    const live = filterLivePending(pending, CHAT_A, new Set(['hello']))
    expect(live).toEqual([
      { chatId: CHAT_A, text: 'world' },
      { chatId: CHAT_B, text: 'unrelated' }
    ])
  })
  test('keeps pending when text not yet echoed', () => {
    expect(filterLivePending(pending, CHAT_A, new Set())).toEqual(pending)
  })
  test('keeps pending for other chats even if text matches', () => {
    const live = filterLivePending(pending, CHAT_B, new Set(['hello']))
    expect(live).toEqual(pending)
  })
  test('null activeChatId only drops pending with chatId=null matched in echo set', () => {
    const p2: PendingText[] = [{ chatId: null, text: 'hi' }]
    expect(filterLivePending(p2, null, new Set(['hi']))).toEqual([])
    expect(filterLivePending(p2, null, new Set())).toEqual(p2)
  })
})
describe('use-chat-convex source guards', () => {
  const hookSrc = readFileSync(join(import.meta.dir, '..', 'hooks', 'use-chat-convex.ts'), 'utf8')
  test('sendMessage uses history.replaceState (not router.replace) to avoid first-message flicker', () => {
    expect(hookSrc).toContain('globalThis.window.history.replaceState')
    expect(hookSrc).not.toMatch(/router\.replace\(/u)
  })
  test('passes livePendingTexts (not raw pendingTexts) to deriveChatState', () => {
    expect(hookSrc).toMatch(/pendingTexts:\s*livePendingTexts/u)
  })
})
