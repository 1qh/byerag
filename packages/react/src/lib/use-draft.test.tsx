import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'bun:test'
import { useDraft } from './use-draft'

afterEach(() => {
  globalThis.localStorage.clear()
})
describe('useDraft', () => {
  test('starts empty when no prior value', () => {
    const { result } = renderHook(() => useDraft('c1'))
    const [value] = result.current
    expect(value).toBe('')
  })
  test('setValue updates in-memory immediately', () => {
    const { result } = renderHook(() => useDraft('c1'))
    act(() => result.current[1]('hello'))
    expect(result.current[0]).toBe('hello')
  })
  test('persists to localStorage per chatId (after 200ms debounce or on unmount)', () => {
    const { result, unmount } = renderHook(() => useDraft('c1'))
    act(() => result.current[1]('persist me'))
    unmount()
    expect(globalThis.localStorage.getItem('draft-c1')).toBe('persist me')
  })
  test('restores from localStorage on mount', () => {
    globalThis.localStorage.setItem('draft-c2', 'restored text')
    const { result } = renderHook(() => useDraft('c2'))
    expect(result.current[0]).toBe('restored text')
  })
  test('different chatIds have isolated drafts', () => {
    globalThis.localStorage.setItem('draft-a', 'alpha')
    globalThis.localStorage.setItem('draft-b', 'beta')
    const { result: rA } = renderHook(() => useDraft('a'))
    const { result: rB } = renderHook(() => useDraft('b'))
    expect(rA.current[0]).toBe('alpha')
    expect(rB.current[0]).toBe('beta')
  })
  test('null chatId uses "new" key', () => {
    globalThis.localStorage.setItem('draft-new', 'unsaved new chat')
    const { result } = renderHook(() => useDraft(null))
    expect(result.current[0]).toBe('unsaved new chat')
  })
  test('switching chatId reloads the draft for the new chat', () => {
    globalThis.localStorage.setItem('draft-a', 'alpha-draft')
    globalThis.localStorage.setItem('draft-b', 'beta-draft')
    const { result, rerender } = renderHook(({ id }: { id: string }) => useDraft(id), {
      initialProps: { id: 'a' }
    })
    expect(result.current[0]).toBe('alpha-draft')
    rerender({ id: 'b' })
    expect(result.current[0]).toBe('beta-draft')
  })
  test('switching chatId back-and-forth preserves each draft', () => {
    const { result, rerender } = renderHook(({ id }: { id: string }) => useDraft(id), {
      initialProps: { id: 'a' }
    })
    act(() => result.current[1]('alpha text'))
    rerender({ id: 'b' })
    act(() => result.current[1]('beta text'))
    rerender({ id: 'a' })
    expect(result.current[0]).toBe('alpha text')
    rerender({ id: 'b' })
    expect(result.current[0]).toBe('beta text')
  })
  test('clear() empties value and removes from localStorage', () => {
    const { result } = renderHook(() => useDraft('c3'))
    act(() => result.current[1]('text'))
    act(() => result.current[2]())
    expect(result.current[0]).toBe('')
    expect(globalThis.localStorage.getItem('draft-c3')).toBeNull()
  })
})
