import type { ReactNode } from 'react'
import { act, renderHook as renderHookRaw, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { AppProvider } from '../app-context'
import { resetFakeConvex, setFakeSend, setFakeStore } from '../test-utils/fake-convex'
import { resetFakeRouter, setFakeRouter } from '../test-utils/fake-router'
import { useChatConvex } from './use-chat-convex'

const wrapper = ({ children }: { children: ReactNode }) => <AppProvider appId='test'>{children}</AppProvider>
const renderHook = ((cb: Parameters<typeof renderHookRaw>[0], opts?: Parameters<typeof renderHookRaw>[1]) =>
  renderHookRaw(cb, { wrapper, ...opts })) as typeof renderHookRaw
beforeEach(() => {
  resetFakeConvex()
  resetFakeRouter()
})
afterEach(() => {
  globalThis.localStorage.clear()
})
describe('useChatConvex', () => {
  test('activeChatId derived from pathname when chatId prop null (post-replaceState path)', () => {
    setFakeRouter({ pathname: '/chat/chat-from-url' })
    const { result } = renderHook(() => useChatConvex({ chatId: null }))
    expect(result.current.activeChatId).toBe('chat-from-url')
  })
  test('activeChatId prefers prop over pathname', () => {
    setFakeRouter({ pathname: '/chat/other' })
    const { result } = renderHook(() => useChatConvex({ chatId: 'prop-chat' as never }))
    expect(result.current.activeChatId).toBe('prop-chat')
  })
  test('activeChatId null when pathname is / (user clicked new-chat)', () => {
    setFakeRouter({ pathname: '/' })
    const { result } = renderHook(() => useChatConvex({ chatId: null }))
    expect(result.current.activeChatId).toBeNull()
  })
  test('empty state when no chatId + nothing pending', async () => {
    const { result } = renderHook(() => useChatConvex({ chatId: null }))
    expect(result.current.state.kind).toBe('empty')
  })
  test('idle when chatId + messages present and nothing streaming', async () => {
    const chatId = 'chat-x'
    setFakeStore({
      messages: new Map([
        [
          chatId,
          [
            {
              _creationTime: 1,
              _id: 'm1',
              content: JSON.stringify({ message: { content: [{ text: 'hi', type: 'text' }], role: 'user' }, type: 'user' })
            },
            {
              _creationTime: 2,
              _id: 'm2',
              content: JSON.stringify({
                message: { content: [{ text: 'hello', type: 'text' }], role: 'assistant' },
                type: 'assistant'
              })
            }
          ]
        ]
      ])
    })
    const { result } = renderHook(() => useChatConvex({ chatId: chatId as never }))
    expect(result.current.state.kind).toBe('idle')
    expect(result.current.messages.length).toBeGreaterThan(0)
  })
  test('streaming state when server reports streaming=true', async () => {
    const chatId = 'chat-stream'
    setFakeStore({
      chatStatus: new Map([[chatId, { streaming: true }]]),
      messages: new Map([
        [
          chatId,
          [
            {
              _creationTime: 1,
              _id: 'u',
              content: JSON.stringify({ message: { content: [{ text: 'hi', type: 'text' }], role: 'user' }, type: 'user' })
            }
          ]
        ]
      ])
    })
    const { result } = renderHook(() => useChatConvex({ chatId: chatId as never }))
    expect(result.current.state.kind).toBe('streaming')
  })
  test('sendMessage on new chat: updates URL via history.replaceState (no Next router push, no page remount)', async () => {
    const origReplace = globalThis.window.history.replaceState.bind(globalThis.window.history)
    const pushed: string[] = []
    globalThis.window.history.replaceState = ((_s: unknown, _u: string, url: string): void => {
      pushed.push(url)
    }) as typeof globalThis.window.history.replaceState
    try {
      const newId = 'new-chat-abc'
      setFakeSend(async () => newId)
      const { result } = renderHook(() => useChatConvex({ chatId: null }))
      await act(async () => {
        result.current.sendMessage('hello')
      })
      await waitFor(() => {
        expect(pushed).toContain(`/chat/${newId}`)
      })
    } finally {
      globalThis.window.history.replaceState = origReplace
    }
  })
  test('sendMessage to existing chat does NOT navigate', async () => {
    const origReplace = globalThis.window.history.replaceState.bind(globalThis.window.history)
    const pushed: string[] = []
    globalThis.window.history.replaceState = ((_s: unknown, _u: string, url: string): void => {
      pushed.push(url)
    }) as typeof globalThis.window.history.replaceState
    try {
      setFakeSend(async () => 'unused')
      const { result } = renderHook(() => useChatConvex({ chatId: 'chat-existing' as never }))
      await act(async () => {
        result.current.sendMessage('follow-up')
      })
      await waitFor(() => {
        expect(pushed).toEqual([])
      })
    } finally {
      globalThis.window.history.replaceState = origReplace
    }
  })
  test('pending text for chatId A does NOT leak into chatId B (bug-2 regression)', async () => {
    const { result, rerender } = renderHook((chatId: null | string) => useChatConvex({ chatId: chatId as never }), {
      initialProps: null
    })
    await act(async () => {
      result.current.sendMessage('message in chat A')
    })
    rerender('chat-b')
    await waitFor(() => {
      expect(result.current.state.kind).toBe('empty')
    })
  })
  test('sendMessage while already streaming is a noop (guard)', async () => {
    const chatId = 'chat-busy'
    setFakeStore({ chatStatus: new Map([[chatId, { streaming: true }]]) })
    let sendCalls = 0
    setFakeSend(async () => {
      sendCalls += 1
      return 'x'
    })
    const { result } = renderHook(() => useChatConvex({ chatId: chatId as never }))
    await act(async () => {
      result.current.sendMessage('blocked')
    })
    expect(sendCalls).toBe(0)
  })
  test('title from chats.status resolves by chatId', () => {
    const chatId = 'chat-title'
    setFakeStore({
      chatStatus: new Map([[chatId, { streaming: false, title: 'My chat' }]])
    })
    const { result } = renderHook(() => useChatConvex({ chatId: chatId as never }))
    expect(result.current.title).toBe('My chat')
  })
  test('title falls back to "chat" when no list entry', () => {
    const { result } = renderHook(() => useChatConvex({ chatId: 'nowhere' as never }))
    expect(result.current.title).toBe('chat')
  })
  test('exportEvents merges messages + stream events', () => {
    const chatId = 'chat-export'
    setFakeStore({
      messages: new Map([
        [
          chatId,
          [
            {
              _creationTime: 1,
              _id: 'u',
              content: JSON.stringify({ message: { content: [{ text: 'hi', type: 'text' }], role: 'user' }, type: 'user' })
            }
          ]
        ]
      ]),
      streamEvents: new Map([
        [
          chatId,
          [
            {
              _creationTime: 2,
              _id: 'e1',
              content: JSON.stringify({
                message: { content: [{ text: 'a', type: 'text' }], role: 'assistant' },
                type: 'assistant'
              }),
              seq: 1
            }
          ]
        ]
      ])
    })
    const { result } = renderHook(() => useChatConvex({ chatId: chatId as never }))
    expect(result.current.exportEvents.length).toBe(2)
  })
  test('streamEvents sorted by seq ascending', () => {
    const chatId = 'chat-seq'
    setFakeStore({
      streamEvents: new Map([
        [
          chatId,
          [
            { _creationTime: 3, _id: 'c', content: 'c', seq: 3 },
            { _creationTime: 1, _id: 'a', content: 'a', seq: 1 },
            { _creationTime: 2, _id: 'b', content: 'b', seq: 2 }
          ]
        ]
      ])
    })
    const { result } = renderHook(() => useChatConvex({ chatId: chatId as never }))
    expect(result.current.streamEvents.map(e => e._id)).toEqual(['a', 'b', 'c'])
  })
  test('pending user text removed once raw messages contain it (dedup)', async () => {
    setFakeSend(async () => 'chat-dedup')
    const { result, rerender } = renderHook((chatId: null | string) => useChatConvex({ chatId: chatId as never }), {
      initialProps: null
    })
    await act(async () => {
      result.current.sendMessage('once')
    })
    rerender('chat-dedup')
    setFakeStore({
      messages: new Map([
        [
          'chat-dedup',
          [
            {
              _creationTime: 1,
              _id: 'u',
              content: JSON.stringify({
                message: { content: [{ text: 'once', type: 'text' }], role: 'user' },
                type: 'user'
              })
            }
          ]
        ]
      ])
    })
    rerender('chat-dedup')
    await waitFor(() => {
      const userMsgs = result.current.messages.filter(m => m.role === 'user')
      expect(userMsgs.length).toBe(1)
    })
  })
  test('error from chat A does NOT leak into chat B on navigation', async () => {
    setFakeSend(async () => {
      throw new Error('boom')
    })
    const { result, rerender } = renderHook((chatId: null | string) => useChatConvex({ chatId: chatId as never }), {
      initialProps: 'chat-a'
    })
    await act(async () => {
      result.current.sendMessage('err in a')
    })
    await waitFor(() => {
      expect(result.current.state.kind).toBe('error')
    })
    rerender('chat-b')
    await waitFor(() => {
      expect(result.current.state.kind).not.toBe('error')
    })
  })
  test('send mutation rejection → error state with text preserved for retry', async () => {
    setFakeSend(async () => {
      throw new Error('network down')
    })
    const { result } = renderHook(() => useChatConvex({ chatId: 'chat-err' as never }))
    await act(async () => {
      result.current.sendMessage('retry me')
    })
    await waitFor(() => {
      expect(result.current.state.kind).toBe('error')
      if (result.current.state.kind === 'error') expect(result.current.state.text).toBe('retry me')
    })
  })
})
