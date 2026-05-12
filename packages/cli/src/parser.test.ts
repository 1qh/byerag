import { describe, expect, it } from 'bun:test'
import { didYouMean, parseFlags } from './parser'
describe(parseFlags, () => {
  it('--key value form', () => {
    expect(parseFlags(['--query', 'inception'])).toStrictEqual({ args: { query: 'inception' }, positional: [] })
  })
  it('--key=value form', () => {
    expect(parseFlags(['--query=inception'])).toStrictEqual({ args: { query: 'inception' }, positional: [] })
  })
  it('boolean flag (no value)', () => {
    expect(parseFlags(['--verbose'])).toStrictEqual({ args: { verbose: 'true' }, positional: [] })
  })
  it('positional argument', () => {
    expect(parseFlags(['inception'])).toStrictEqual({ args: {}, positional: ['inception'] })
  })
  it('mixed positional and flags', () => {
    expect(parseFlags(['inception', '--year', '2010'])).toStrictEqual({
      args: { year: '2010' },
      positional: ['inception']
    })
  })
  it('value containing equals', () => {
    expect(parseFlags(['--filter=year=2024'])).toStrictEqual({ args: { filter: 'year=2024' }, positional: [] })
  })
  it('flag followed by another flag (no value)', () => {
    expect(parseFlags(['--verbose', '--quiet'])).toStrictEqual({
      args: { quiet: 'true', verbose: 'true' },
      positional: []
    })
  })
})
describe(didYouMean, () => {
  it('suggests close match', () => {
    expect(didYouMean('foom', ['foo', 'admin'])).toBe('foo')
  })
  it('returns null for no options', () => {
    expect(didYouMean('anything', [])).toBeNull()
  })
  it('returns null when nothing close', () => {
    expect(didYouMean('xyz', ['foo', 'admin'])).toBeNull()
  })
})
