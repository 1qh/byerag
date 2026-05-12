import { act, renderHook } from '@testing-library/react'
import { describe, expect, mock, test } from 'bun:test'
import { PaneProvider, usePane } from './pane-context'
describe('PaneProvider + usePane', () => {
  test('throws outside provider', () => {
    expect(() => renderHook(() => usePane())).toThrow('usePane must be used inside <PaneProvider>')
  })
  test('opens then closes a subject', () => {
    const { result } = renderHook(() => usePane(), { wrapper: PaneProvider })
    expect(result.current.subject).toBeNull()
    act(() => result.current.openSubject({ breadcrumb: 'test', kind: 'foo', payload: { a: 1 } }))
    expect(result.current.subject?.kind).toBe('foo')
    expect(result.current.subject?.payload).toEqual({ a: 1 })
    act(() => result.current.closePane())
    expect(result.current.subject).toBeNull()
  })
  test('register/unregister draftAppender', () => {
    const { result } = renderHook(() => usePane(), { wrapper: PaneProvider })
    expect(result.current.draftAppender).toBeNull()
    const appender = mock()
    let unsub: () => void = () => null
    act(() => {
      unsub = result.current.registerDraftAppender(appender)
    })
    expect(typeof result.current.draftAppender).toBe('function')
    result.current.draftAppender?.('hello')
    expect(appender).toHaveBeenCalledWith('hello')
    act(() => unsub())
    expect(result.current.draftAppender).toBeNull()
  })
  test('appendDraft adds a line', () => {
    const { result } = renderHook(() => usePane(), { wrapper: PaneProvider })
    expect(result.current.draftedLines).toEqual([])
    act(() => result.current.appendDraft('remove ACME Corp'))
    expect(result.current.draftedLines).toHaveLength(1)
    expect(result.current.draftedLines[0]?.text).toBe('remove ACME Corp')
  })
  test('appendDraft groups within 500ms window', () => {
    const { result } = renderHook(() => usePane(), { wrapper: PaneProvider })
    act(() => result.current.appendDraft('a'))
    act(() => result.current.appendDraft('b'))
    expect(result.current.draftedLines).toHaveLength(1)
    expect(result.current.draftedLines[0]?.text).toBe('a\nb')
  })
  test('clearDrafts empties queue; removeDraft removes one', () => {
    const { result } = renderHook(() => usePane(), { wrapper: PaneProvider })
    act(() => result.current.appendDraft('x'))
    const firstId = result.current.draftedLines[0]?.id ?? ''
    act(() => result.current.removeDraft(firstId))
    expect(result.current.draftedLines).toEqual([])
    act(() => result.current.appendDraft('y'))
    act(() => result.current.clearDrafts())
    expect(result.current.draftedLines).toEqual([])
  })
  test('empty + whitespace lines ignored', () => {
    const { result } = renderHook(() => usePane(), { wrapper: PaneProvider })
    act(() => result.current.appendDraft('   '))
    act(() => result.current.appendDraft(''))
    expect(result.current.draftedLines).toEqual([])
  })
})
