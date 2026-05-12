import type { Id } from 'backend/convex/_generated/dataModel'
import { describe, expect, test } from 'bun:test'
import type { DeriveInput } from './chat-state'
import type { UIMessage } from './ui-messages'
import { deriveChatState } from './chat-state'
const CHAT_A = 'chat-a' as Id<'chats'>
const CHAT_B = 'chat-b' as Id<'chats'>
const userMsg = (id: string, text: string): UIMessage => ({ id, parts: [{ text, type: 'text' }], role: 'user' })
const assistantMsg = (id: string, text: string): UIMessage => ({ id, parts: [{ text, type: 'text' }], role: 'assistant' })
const emptyAssistantMsg = (id: string): UIMessage => ({ id, parts: [{ text: '', type: 'text' }], role: 'assistant' })
const base = (partial?: Partial<DeriveInput>): DeriveInput => ({
  activeChatId: null,
  isMutationPending: false,
  isStreaming: false,
  messages: [],
  pendingTexts: [],
  ...partial
})
describe('deriveChatState', () => {
  test('no chat, no pending → empty', () => {
    expect(deriveChatState(base())).toEqual({ kind: 'empty' })
  })
  test('active chat with messages, nothing pending, not streaming → idle', () => {
    const s = deriveChatState(base({ activeChatId: CHAT_A, messages: [userMsg('u1', 'hi'), assistantMsg('a1', 'hello')] }))
    expect(s).toEqual({ chatId: CHAT_A, kind: 'idle' })
  })
  test('new-chat submit (no chatId yet) + isMutationPending → submitting', () => {
    const s = deriveChatState(base({ isMutationPending: true, pendingTexts: [{ chatId: null, text: 'first msg' }] }))
    expect(s).toEqual({ chatId: null, kind: 'submitting', text: 'first msg' })
  })
  test('existing chat, mutation in flight with matching pending → submitting', () => {
    const s = deriveChatState(
      base({
        activeChatId: CHAT_A,
        isMutationPending: true,
        pendingTexts: [{ chatId: CHAT_A, text: 'hi' }]
      })
    )
    expect(s).toEqual({ chatId: CHAT_A, kind: 'submitting', text: 'hi' })
  })
  test('active chat streaming, no assistant text yet → streaming with assistantHasText=false', () => {
    const s = deriveChatState(base({ activeChatId: CHAT_A, isStreaming: true, messages: [userMsg('u1', 'hi')] }))
    expect(s).toEqual({ assistantHasText: false, chatId: CHAT_A, kind: 'streaming' })
  })
  test('active chat streaming, assistant message still empty → assistantHasText=false', () => {
    const s = deriveChatState(
      base({
        activeChatId: CHAT_A,
        isStreaming: true,
        messages: [userMsg('u1', 'hi'), emptyAssistantMsg('a1')]
      })
    )
    expect(s).toEqual({ assistantHasText: false, chatId: CHAT_A, kind: 'streaming' })
  })
  test('active chat streaming, assistant has real text → assistantHasText=true', () => {
    const s = deriveChatState(
      base({
        activeChatId: CHAT_A,
        isStreaming: true,
        messages: [userMsg('u1', 'hi'), assistantMsg('a1', 'partial reply')]
      })
    )
    expect(s).toEqual({ assistantHasText: true, chatId: CHAT_A, kind: 'streaming' })
  })
  test('active chat, isStreaming=false but pending for this chat → still streaming (latch)', () => {
    const s = deriveChatState(
      base({
        activeChatId: CHAT_A,
        isStreaming: false,
        pendingTexts: [{ chatId: CHAT_A, text: 'hi' }]
      })
    )
    expect(s).toEqual({ assistantHasText: false, chatId: CHAT_A, kind: 'streaming' })
  })
  test('pending for other chat MUST NOT leak into current view → empty when switched to new chat', () => {
    const s = deriveChatState(base({ activeChatId: null, pendingTexts: [{ chatId: CHAT_B, text: 'other' }] }))
    expect(s).toEqual({ kind: 'empty' })
  })
  test('pending for other chat does not turn idle chat into streaming', () => {
    const s = deriveChatState(
      base({
        activeChatId: CHAT_A,
        messages: [userMsg('u1', 'old'), assistantMsg('a1', 'old reply')],
        pendingTexts: [{ chatId: CHAT_B, text: 'other' }]
      })
    )
    expect(s).toEqual({ chatId: CHAT_A, kind: 'idle' })
  })
  test('lastError + pending → error with the text preserved', () => {
    const s = deriveChatState(
      base({
        activeChatId: CHAT_A,
        lastError: 'network failed',
        pendingTexts: [{ chatId: CHAT_A, text: 'hi' }]
      })
    )
    expect(s).toEqual({ chatId: CHAT_A, error: 'network failed', kind: 'error', text: 'hi' })
  })
  test('bug-2 regression: streaming in chat B should not show chat A pending', () => {
    const s = deriveChatState(
      base({
        activeChatId: CHAT_B,
        isStreaming: true,
        messages: [userMsg('u1', 'hi in B')],
        pendingTexts: [
          { chatId: CHAT_A, text: 'old A msg' },
          { chatId: CHAT_B, text: 'hi in B' }
        ]
      })
    )
    expect(s).toEqual({ assistantHasText: false, chatId: CHAT_B, kind: 'streaming' })
  })
  test('bug-2 regression: clicking new chat during streaming lands in empty, not leaked', () => {
    const s = deriveChatState(base({ activeChatId: null, pendingTexts: [{ chatId: CHAT_A, text: 'streaming in A' }] }))
    expect(s).toEqual({ kind: 'empty' })
  })
  test('activeChatId + zero messages + nothing pending = empty (not idle — guards messages.length > 0 mutation)', () => {
    const s = deriveChatState(base({ activeChatId: CHAT_A, messages: [] }))
    expect(s).toEqual({ kind: 'empty' })
  })
})
