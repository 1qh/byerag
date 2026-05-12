import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { useCountdown } from './use-countdown'
describe('useCountdown', () => {
  let originalSetTimeout: typeof setTimeout
  let pending: { cb: () => void; ms: number }[]
  beforeEach(() => {
    originalSetTimeout = globalThis.setTimeout
    pending = []
    globalThis.setTimeout = ((cb: () => void, ms: number) => {
      pending.push({ cb, ms })
      return pending.length as unknown as ReturnType<typeof setTimeout>
    }) as typeof setTimeout
  })
  afterEach(() => {
    globalThis.setTimeout = originalSetTimeout
  })
  const tick = (): void => {
    const next = pending.shift()
    if (next) act(() => next.cb())
  }
  test('starts at given seconds', () => {
    const { result } = renderHook(() => useCountdown(5, () => null))
    expect(result.current.remaining).toBe(5)
  })
  test('decrements per tick and fires onExpire on last tick', () => {
    const onExpire = mock()
    const { result } = renderHook(() => useCountdown(2, onExpire))
    expect(result.current.remaining).toBe(2)
    tick()
    expect(result.current.remaining).toBe(1)
    tick()
    expect(onExpire).toHaveBeenCalledTimes(1)
  })
  test('cancel halts countdown and onExpire never fires', () => {
    const onExpire = mock()
    const { result } = renderHook(() => useCountdown(3, onExpire))
    act(() => result.current.cancel())
    tick()
    tick()
    tick()
    expect(onExpire).not.toHaveBeenCalled()
    expect(result.current.remaining).toBe(-1)
  })
  test('zero seconds means inert', () => {
    const onExpire = mock()
    renderHook(() => useCountdown(0, onExpire))
    tick()
    expect(onExpire).not.toHaveBeenCalled()
  })
})
