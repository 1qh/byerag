import { describe, expect, test } from 'bun:test'
import { buildSuggestions } from './mention-autocomplete'

const items = [
  { kind: 'collection', lastModifiedAt: 100, name: 'germany-q2' },
  { kind: 'collection', lastModifiedAt: 200, name: 'dach-coffee' },
  { kind: 'template', lastModifiedAt: 50, name: 'cold-coffee' },
  { kind: 'template', lastModifiedAt: 60, name: 'follow-up' }
]
describe('buildSuggestions', () => {
  test('shows all kinds on bare @', () => {
    expect.hasAssertions()
    const r = buildSuggestions(items, { end: 1, kindFragment: '', nameFragment: null, start: 0 })
    expect(r.length).toBeGreaterThan(items.length - 1)
    expect(r.some(s => s.item.kind === 'me')).toBeTruthy()
  })
  test('narrows by kind fragment', () => {
    expect.hasAssertions()
    const r = buildSuggestions(items, { end: 9, kindFragment: 'template', nameFragment: null, start: 0 })
    expect(r.every(s => s.item.kind === 'template' || s.item.kind === 'me')).toBeTruthy()
  })
  test('narrows by name fragment', () => {
    expect.hasAssertions()
    const r = buildSuggestions(items, { end: 14, kindFragment: 'template', nameFragment: 'cold', start: 0 })
    expect(r.find(s => !s.createNew)?.item.name).toBe('cold-coffee')
  })
  test('offers create-new on no-match for creatable kind', () => {
    expect.hasAssertions()
    const r = buildSuggestions(items, { end: 18, kindFragment: 'collection', nameFragment: 'brand-new', start: 0 })
    expect(r.some(s => s.createNew && s.item.name === 'brand-new')).toBeTruthy()
  })
  test('does NOT offer create-new for non-creatable kind', () => {
    expect.hasAssertions()
    const r = buildSuggestions(items, { end: 12, kindFragment: 'company', nameFragment: 'unknown', start: 0 })
    expect(r.some(s => s.createNew)).toBeFalsy()
  })
  test('insertText carries trailing space', () => {
    expect.hasAssertions()
    const r = buildSuggestions(items, { end: 9, kindFragment: 'template', nameFragment: null, start: 0 })
    expect(r[0]?.insertText.endsWith(' ')).toBeTruthy()
  })
  test('@me singleton uses @me without colon', () => {
    expect.hasAssertions()
    const r = buildSuggestions([], { end: 3, kindFragment: 'me', nameFragment: null, start: 0 })
    expect(r[0]?.insertText).toBe('@me ')
  })
})
