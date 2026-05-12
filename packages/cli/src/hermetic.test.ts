import { afterEach, describe, expect, it } from 'bun:test'
import { hermeticTry, setHermeticAdapter } from './hermetic'
afterEach(() => setHermeticAdapter(null))
describe('hermetic adapter', () => {
  it('returns undefined when no adapter set', () => {
    expect(hermeticTry('mock.search', { collection: 'x', params: {} })).toBeUndefined()
  })
  it('returns adapter result when set', () => {
    setHermeticAdapter((op, payload) => (op === 'mock.search' ? { hits: [], op, payload } : undefined))
    const r = hermeticTry<{ hits: unknown[]; op: string }>('mock.search', { q: 'x' })
    expect(r?.op).toBe('mock.search')
    expect(r?.hits).toStrictEqual([])
  })
  it('lets adapter pass-through by returning undefined', () => {
    setHermeticAdapter(() => undefined)
    expect(hermeticTry('mock.complete', { prompt: 'hi' })).toBeUndefined()
  })
  it('resets cleanly', () => {
    setHermeticAdapter(() => 42)
    expect(hermeticTry('mock.search', { collection: 'x', params: {} })).toBe(42)
    setHermeticAdapter(null)
    expect(hermeticTry('mock.search', { collection: 'x', params: {} })).toBeUndefined()
  })
})
