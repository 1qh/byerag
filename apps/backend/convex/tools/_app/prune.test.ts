import { describe, expect, it } from 'bun:test'
import { makeTest } from '../../../test-utils/convex'
import { internal } from '../../_generated/api'
describe('prune jobs', () => {
  it('pruneExpiredTraces deletes rows past expiresAt', async () => {
    const t = makeTest()
    const now = Date.now()
    await t.run(async ctx => {
      await ctx.db.insert('xTraces', {
        args: '{}',
        command: 'a',
        durationMs: 1,
        expiresAt: now - 1000,
        mode: 'token',
        ok: true,
        owner: 'o',
        steps: '[]',
        traceId: 'tr_old'
      })
      await ctx.db.insert('xTraces', {
        args: '{}',
        command: 'b',
        durationMs: 1,
        expiresAt: now + 10_000,
        mode: 'token',
        ok: true,
        owner: 'o',
        steps: '[]',
        traceId: 'tr_fresh'
      })
    })
    await t.mutation(internal.tools._app.dispatch.pruneExpiredTraces, {})
    const rows = await t.run(async ctx => ctx.db.query('xTraces').collect())
    expect(rows).toHaveLength(1)
    expect(rows[0]?.traceId).toBe('tr_fresh')
  })
  it('cache.pruneExpired deletes rows past expiresAt', async () => {
    const t = makeTest()
    const now = Date.now()
    await t.run(async ctx => {
      await ctx.db.insert('xToolCache', { expiresAt: now - 1000, key: 'old', payload: '{}' })
      await ctx.db.insert('xToolCache', { expiresAt: now + 10_000, key: 'fresh', payload: '{}' })
    })
    await t.mutation(internal.tools._app.cache.pruneExpired, {})
    const rows = await t.run(async ctx => ctx.db.query('xToolCache').collect())
    expect(rows).toHaveLength(1)
    expect(rows[0]?.key).toBe('fresh')
  })
})
