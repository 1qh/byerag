import { describe, expect, it, spyOn } from 'bun:test'
import { constantTimeEqual, log } from './utils'

describe(constantTimeEqual, () => {
  it('equal strings → true', () => {
    expect(constantTimeEqual('abc', 'abc')).toBeTruthy()
  })
  it('different strings same length → false', () => {
    expect(constantTimeEqual('abc', 'abd')).toBeFalsy()
  })
  it('different lengths → false', () => {
    expect(constantTimeEqual('abc', 'abcd')).toBeFalsy()
  })
  it('empty/empty → true; empty/non-empty → false', () => {
    expect(constantTimeEqual('', '')).toBe(true)
    expect(constantTimeEqual('', 'x')).toBeFalsy()
    expect(constantTimeEqual('x', '')).toBeFalsy()
  })
})
describe(log, () => {
  it('info/warn → console.log with JSON line', () => {
    const spy = spyOn(console, 'log').mockReturnValue(undefined)
    log('info', 'evt', { x: 1 })
    expect(spy).toHaveBeenCalledOnce()
    const firstCall = spy.mock.calls[0] as [string, ...unknown[]] | undefined
    const msg = firstCall?.[0] ?? ''
    const parsed = JSON.parse(msg) as { event: string; level: string; x: number }
    expect(parsed.event).toBe('evt')
    expect(parsed.level).toBe('info')
    expect(parsed.x).toBe(1)
    spy.mockRestore()
  })
  it('error → console.error', () => {
    const spy = spyOn(console, 'error').mockReturnValue(undefined)
    log('error', 'bad')
    expect(spy).toHaveBeenCalledOnce()
    spy.mockRestore()
  })
})
