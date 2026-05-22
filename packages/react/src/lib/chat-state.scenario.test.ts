import type { Id } from 'backend/convex/_generated/dataModel'
import { describe, expect, test } from 'bun:test'
import type { DeriveInput } from './chat-state'
import type { UIMessage } from './ui-messages'
import { deriveChatState } from './chat-state'

const CHAT_A = 'chat-a' as Id<'chats'>
const CHAT_B = 'chat-b' as Id<'chats'>
const user = (text: string): UIMessage => ({ id: `u-${text}`, parts: [{ text, type: 'text' }], role: 'user' })
const assistant = (text: string): UIMessage => ({ id: `a-${text}`, parts: [{ text, type: 'text' }], role: 'assistant' })
interface Scenario {
  expect: string
  input: DeriveInput
  step: string
}
const trace = (scenario: readonly Scenario[]): { actual: string; expected: string; step: string }[] =>
  scenario.map(s => ({ actual: deriveChatState(s.input).kind, expected: s.expect, step: s.step }))
const base = (partial: Partial<DeriveInput>): DeriveInput => ({
  activeChatId: null,
  isMutationPending: false,
  isStreaming: false,
  messages: [],
  pendingTexts: [],
  ...partial
})
describe('scenarios', () => {
  test('happy path: new-chat → submit → mutation ok → streaming → assistant text → complete → idle', () => {
    const t = trace([
      { expect: 'empty', input: base({}), step: '0. land on new chat' },
      {
        expect: 'submitting',
        input: base({ isMutationPending: true, pendingTexts: [{ chatId: null, text: 'hi' }] }),
        step: '1. hit enter — mutation in-flight, still on /'
      },
      {
        expect: 'submitting',
        input: base({
          activeChatId: CHAT_A,
          isMutationPending: true,
          pendingTexts: [{ chatId: CHAT_A, text: 'hi' }]
        }),
        step: '2. mutation resolves, router.push lands on /chat/A, pending reassigned'
      },
      {
        expect: 'streaming',
        input: base({
          activeChatId: CHAT_A,
          isStreaming: true,
          messages: [user('hi')],
          pendingTexts: [{ chatId: CHAT_A, text: 'hi' }]
        }),
        step: '3. server flipped chat.streaming=true, user msg in rawMessages'
      },
      {
        expect: 'streaming',
        input: base({
          activeChatId: CHAT_A,
          isStreaming: true,
          messages: [user('hi'), assistant('partial')]
        }),
        step: '4. first assistant text delta arrives, pending cleared after match'
      },
      {
        expect: 'idle',
        input: base({
          activeChatId: CHAT_A,
          isStreaming: false,
          messages: [user('hi'), assistant('full reply')]
        }),
        step: '5. stream complete, server chat.streaming=false, full assistant msg persisted'
      }
    ])
    expect(t.every(s => s.actual === s.expected)).toBe(true)
  })
  test('bug-2 scenario: user clicks new-chat during streaming in A', () => {
    const t = trace([
      {
        expect: 'streaming',
        input: base({
          activeChatId: CHAT_A,
          isStreaming: true,
          messages: [user('hi in A'), assistant('part')]
        }),
        step: '0. streaming in A'
      },
      {
        expect: 'empty',
        input: base({
          activeChatId: null,
          pendingTexts: [{ chatId: CHAT_A, text: 'hi in A' }]
        }),
        step: '1. user clicks new-chat → nav to /, pending for A does NOT leak'
      }
    ])
    expect(t.every(s => s.actual === s.expected)).toBe(true)
  })
  test('concurrent: user streams in A then navigates to B which has history', () => {
    const t = trace([
      {
        expect: 'streaming',
        input: base({
          activeChatId: CHAT_A,
          isStreaming: true,
          messages: [user('hi A')]
        }),
        step: '0. streaming in A'
      },
      {
        expect: 'idle',
        input: base({
          activeChatId: CHAT_B,
          messages: [user('old msg'), assistant('old reply')],
          pendingTexts: [{ chatId: CHAT_A, text: 'hi A' }]
        }),
        step: '1. switch to B; B is idle; A pending must not leak'
      }
    ])
    expect(t.every(s => s.actual === s.expected)).toBe(true)
  })
  test('error: network failure during submit, then retry', () => {
    const t = trace([
      {
        expect: 'submitting',
        input: base({ isMutationPending: true, pendingTexts: [{ chatId: null, text: 'hi' }] }),
        step: '0. send in-flight'
      },
      {
        expect: 'error',
        input: base({
          lastError: 'fetch failed',
          pendingTexts: [{ chatId: null, text: 'hi' }]
        }),
        step: '1. mutation rejects; pending retained so user can retry'
      },
      {
        expect: 'submitting',
        input: base({
          isMutationPending: true,
          pendingTexts: [{ chatId: null, text: 'hi' }]
        }),
        step: '2. retry; lastError cleared by next submit'
      }
    ])
    expect(t.every(s => s.actual === s.expected)).toBe(true)
  })
  test('latch: pending + !streaming keeps UI as streaming until server catches up', () => {
    const t = trace([
      {
        expect: 'streaming',
        input: base({
          activeChatId: CHAT_A,
          isStreaming: false,
          pendingTexts: [{ chatId: CHAT_A, text: 'hi' }]
        }),
        step: '0. mutation done, no server-side streaming flag yet, pending latches UI'
      },
      {
        expect: 'streaming',
        input: base({
          activeChatId: CHAT_A,
          isStreaming: true,
          messages: [user('hi')],
          pendingTexts: [{ chatId: CHAT_A, text: 'hi' }]
        }),
        step: '1. server caught up'
      }
    ])
    expect(t.every(s => s.actual === s.expected)).toBe(true)
  })
})
