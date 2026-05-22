import { renderHook } from '@testing-library/react'
import { describe, expect, test } from 'bun:test'
import { PaneProvider, usePane } from '../components/pane/pane-context'
import { usePaneSubject } from './use-pane-subject'

const usePaneHarness = (kind: null | string, breadcrumb: string, payload: unknown) => {
  const { subject } = usePane()
  usePaneSubject(kind, breadcrumb, payload)
  return subject
}
describe('usePaneSubject', () => {
  test('opens subject when kind is provided', () => {
    const { result, rerender } = renderHook(
      ({ kind, breadcrumb, payload }) => {
        usePaneSubject(kind, breadcrumb, payload)
        return usePane().subject
      },
      {
        initialProps: { breadcrumb: 'col-1', kind: 'collection', payload: { id: '1' } },
        wrapper: PaneProvider
      }
    )
    expect(result.current?.kind).toBe('collection')
    expect(result.current?.breadcrumb).toBe('col-1')
    expect(result.current?.payload).toEqual({ id: '1' })
    rerender({ breadcrumb: 'col-2', kind: 'collection', payload: { id: '2' } })
    expect(result.current?.payload).toEqual({ id: '2' })
  })
  test('skips opening when kind is null', () => {
    const { result } = renderHook(() => usePaneHarness(null, 'noop', { x: 1 }), { wrapper: PaneProvider })
    expect(result.current).toBeNull()
  })
})
