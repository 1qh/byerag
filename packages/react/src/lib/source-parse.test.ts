import { describe, expect, test } from 'bun:test'
import { extractSources } from './source-parse'

describe('extractSources', () => {
  test('empty input', () => {
    expect(extractSources(undefined)).toEqual([])
    expect(extractSources([])).toEqual([])
    expect(extractSources('string not array')).toEqual([])
  })
  test('extracts title, url, domain (www stripped), favicon', () => {
    const [e] = extractSources([{ title: 'Example', url: 'https://www.example.com/page' }])
    expect(e?.url).toBe('https://www.example.com/page')
    expect(e?.title).toBe('Example')
    expect(e?.domain).toBe('example.com')
  })
  test('falls back to url as title when title missing', () => {
    const [e] = extractSources([{ url: 'https://foo.bar' }])
    expect(e?.title).toBe('https://foo.bar')
  })
  test('skips entries without url', () => {
    expect(extractSources([{ title: 'no url' }, null, 42])).toEqual([])
  })
  test('skips entries with unsafe / unparseable URLs', () => {
    expect(extractSources([{ url: 'not-a-real-url' }])).toEqual([])
    expect(extractSources([{ url: 'http://insecure.example' }])).toEqual([])
  })
})
