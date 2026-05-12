import { afterEach, describe, expect, it } from 'bun:test'
import { unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { hermeticTry, setHermeticAdapter } from './hermetic'
import { loadHermeticFixtures } from './load-hermetic-fixtures'
afterEach(() => {
  setHermeticAdapter(null)
})
describe('loadHermeticFixtures', () => {
  it('serves op-level fixtures from shipped JSON', () => {
    loadHermeticFixtures(resolve(import.meta.dirname, './hermetic-fixtures.json'))
    const search = hermeticTry<{ hits: unknown[] }>('mock.search', { q: 'x' })
    expect(search?.hits).toStrictEqual([])
    const embed = hermeticTry<number[]>('mock.embed', { text: 'hi' })
    expect(embed?.length).toBe(8)
    const complete = hermeticTry<string>('mock.complete', { prompt: 'x' })
    expect(complete).toBeTypeOf('string')
  })
  it('matches payload-specific rules before falling back', () => {
    const tmp = resolve(import.meta.dirname, '__tmp_fixtures.json')
    writeFileSync(
      tmp,
      JSON.stringify({
        'mock.search': [{ match: 'target-key', response: { hits: [{ row: 1 }] } }, { response: { hits: [] } }]
      })
    )
    try {
      loadHermeticFixtures(tmp)
      const targetHit = hermeticTry<{ hits: unknown[] }>('mock.search', { collection: 'target-key' })
      expect(targetHit?.hits).toHaveLength(1)
      const otherHit = hermeticTry<{ hits: unknown[] }>('mock.search', { collection: 'other-key' })
      expect(otherHit?.hits).toStrictEqual([])
    } finally {
      unlinkSync(tmp)
    }
  })
})
