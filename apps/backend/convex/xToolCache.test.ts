import { expect, test } from 'bun:test'
import { makeTest } from '../test-utils/convex'
import { internal } from './_generated/api'
test('cache store + lookup roundtrip', async () => {
  const t = makeTest()
  await t.mutation(internal.tools._app.cache.store, { key: 'test:abc', payload: '{"hello":"world"}' })
  const hit = await t.query(internal.tools._app.cache.lookup, { key: 'test:abc' })
  expect(hit).toBe('{"hello":"world"}')
})
test('cache lookup returns null for missing key', async () => {
  const t = makeTest()
  const hit = await t.query(internal.tools._app.cache.lookup, { key: 'test:missing' })
  expect(hit).toBeNull()
})
test('cache store overwrites existing entry', async () => {
  const t = makeTest()
  await t.mutation(internal.tools._app.cache.store, { key: 'test:dup', payload: 'v1' })
  await t.mutation(internal.tools._app.cache.store, { key: 'test:dup', payload: 'v2' })
  const hit = await t.query(internal.tools._app.cache.lookup, { key: 'test:dup' })
  expect(hit).toBe('v2')
})
test('pruneExpired deletes only expired rows', async () => {
  const t = makeTest()
  await t.mutation(internal.tools._app.cache.store, { key: 'test:fresh', payload: 'fresh' })
  await t.run(async ctx => {
    await ctx.db.insert('xToolCache', { expiresAt: Date.now() - 1000, key: 'test:expired', payload: 'old' })
  })
  const result = await t.mutation(internal.tools._app.cache.pruneExpired, {})
  expect(result.deleted).toBe(1)
  await expect(t.query(internal.tools._app.cache.lookup, { key: 'test:fresh' })).resolves.toBe('fresh')
  await expect(t.query(internal.tools._app.cache.lookup, { key: 'test:expired' })).resolves.toBeNull()
})
test('expired row returns null from lookup (before prune)', async () => {
  const t = makeTest()
  await t.run(async ctx => {
    await ctx.db.insert('xToolCache', { expiresAt: Date.now() - 1000, key: 'test:old', payload: 'stale' })
  })
  const hit = await t.query(internal.tools._app.cache.lookup, { key: 'test:old' })
  expect(hit).toBeNull()
})
