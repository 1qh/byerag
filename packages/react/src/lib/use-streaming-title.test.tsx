import { renderHook } from '@a/react/test-utils/render'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { resetFakeConvex, setFakeStore } from '../test-utils/fake-convex'
import { useStreamingTitle } from './use-streaming-title'

const originalTitle = 'test-app'
beforeEach(() => {
  resetFakeConvex()
  globalThis.document.title = originalTitle
})
afterEach(() => {
  globalThis.document.title = originalTitle
})
describe('useStreamingTitle', () => {
  test('no chats streaming → document.title unchanged (no dot)', () => {
    renderHook(() => useStreamingTitle())
    expect(globalThis.document.title).toBe(originalTitle)
  })
  test('some chat streaming → prepends ● ', () => {
    setFakeStore({
      chatList: [{ _id: 'a', streaming: true, title: 't', updatedAt: 1 }] as never
    })
    renderHook(() => useStreamingTitle())
    expect(globalThis.document.title.startsWith('●')).toBe(true)
  })
})
