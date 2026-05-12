import { describe, expect, it } from 'bun:test'
import { cacheKey } from './cache'
describe(cacheKey, () => {
  it('same tool + args → same key', async () => {
    const a = await cacheKey('o1', 'sandbox', 'app.tool@1', { importer: 'US' })
    const b = await cacheKey('o1', 'sandbox', 'app.tool@1', { importer: 'US' })
    expect(a).toBe(b)
  })
  it('different version produces different key (cache miss across versions)', async () => {
    const v1 = await cacheKey('o1', 'sandbox', 'app.tool@1', { importer: 'US' })
    const v2 = await cacheKey('o1', 'sandbox', 'app.tool@2', { importer: 'US' })
    expect(v1).not.toBe(v2)
  })
  it('different tool path produces different key', async () => {
    const a = await cacheKey('o1', 'sandbox', 'app.tool@1', { x: 1 })
    const b = await cacheKey('o1', 'sandbox', 'app.other@1', { x: 1 })
    expect(a).not.toBe(b)
  })
  it('different args produces different key', async () => {
    const a = await cacheKey('o1', 'sandbox', 't@1', { x: 1 })
    const b = await cacheKey('o1', 'sandbox', 't@1', { x: 2 })
    expect(a).not.toBe(b)
  })
  it('key insertion order is canonicalized — same hash regardless of order', async () => {
    const raw1 = { a: 1, b: 2 } as const
    const raw2: Record<string, unknown> = {}
    raw2.b = 2
    raw2.a = 1
    const a = await cacheKey('o1', 'sandbox', 't@1', raw1)
    const b = await cacheKey('o1', 'sandbox', 't@1', raw2)
    expect(a).toBe(b)
  })
  it('canonicalization is recursive for nested objects', async () => {
    const a = await cacheKey('o1', 'sandbox', 't@1', { nest: { x: 1, y: 2 } })
    const nested: Record<string, unknown> = {}
    nested.y = 2
    nested.x = 1
    const b = await cacheKey('o1', 'sandbox', 't@1', { nest: nested })
    expect(a).toBe(b)
  })
  it('deep-equal args with same insertion order produce same key', async () => {
    const a = await cacheKey('o1', 'sandbox', 't@1', { arr: [1, 2], nested: { x: true } })
    const b = await cacheKey('o1', 'sandbox', 't@1', { arr: [1, 2], nested: { x: true } })
    expect(a).toBe(b)
  })
})
