/* oxlint-disable eslint(no-await-in-loop) */
import { describe, expect, test } from 'bun:test'
import { makeTest } from '../test-utils/convex'
import { internal } from './_generated/api'
const ONE_HOUR_MS = 60 * 60 * 1000
describe('sandboxes.upsert branches', () => {
  test('first upsert creates row, accepted=true', async () => {
    const t = makeTest()
    const r = await t.mutation(internal.sandboxes.upsert, { owner: 'a@x', sandboxId: 'sb1' })
    expect(r.accepted).toBe(true)
    expect(r.existingSandboxId).toBeUndefined()
  })
  test('same sandboxId re-upsert touches lastUsedAt', async () => {
    const t = makeTest()
    await t.mutation(internal.sandboxes.upsert, { owner: 'a@x', sandboxId: 'sb1' })
    const before = await t.query(internal.sandboxes.getByOwner, { owner: 'a@x' })
    await new Promise<void>(resolve => {
      setTimeout(resolve, 10)
    })
    const r = await t.mutation(internal.sandboxes.upsert, { owner: 'a@x', sandboxId: 'sb1' })
    expect(r.accepted).toBe(true)
    const after = await t.query(internal.sandboxes.getByOwner, { owner: 'a@x' })
    expect(after?.lastUsedAt ?? 0).toBeGreaterThanOrEqual(before?.lastUsedAt ?? 0)
  })
  test('different sandboxId, fresh incumbent: incumbent wins, new is rejected', async () => {
    const t = makeTest()
    await t.mutation(internal.sandboxes.upsert, { owner: 'a@x', sandboxId: 'sb-fresh' })
    const r = await t.mutation(internal.sandboxes.upsert, { owner: 'a@x', sandboxId: 'sb-new' })
    expect(r.accepted).toBe(false)
    expect(r.existingSandboxId).toBe('sb-fresh')
    const row = await t.query(internal.sandboxes.getByOwner, { owner: 'a@x' })
    expect(row?.sandboxId).toBe('sb-fresh')
  })
  test('different sandboxId, stale incumbent (>1h old): new wins, accepted=true', async () => {
    const t = makeTest()
    const stale = Date.now() - ONE_HOUR_MS * 2
    await t.run(async ctx => {
      await ctx.db.insert('sandboxes', { lastUsedAt: stale, owner: 'a@x', sandboxId: 'sb-stale' })
    })
    const r = await t.mutation(internal.sandboxes.upsert, { owner: 'a@x', sandboxId: 'sb-fresh' })
    expect(r.accepted).toBe(true)
    expect(r.existingSandboxId).toBeUndefined()
    const row = await t.query(internal.sandboxes.getByOwner, { owner: 'a@x' })
    expect(row?.sandboxId).toBe('sb-fresh')
  })
  test('sibling duplicates removed; keep[0] preserved', async () => {
    const t = makeTest()
    await t.run(async ctx => {
      await ctx.db.insert('sandboxes', { lastUsedAt: Date.now(), owner: 'a@x', sandboxId: 'sb1' })
      await ctx.db.insert('sandboxes', { lastUsedAt: Date.now(), owner: 'a@x', sandboxId: 'sb2' })
    })
    const r = await t.mutation(internal.sandboxes.upsert, { owner: 'a@x', sandboxId: 'sb1' })
    expect(r.accepted).toBe(true)
    const rows = await t.run(async ctx =>
      ctx.db
        .query('sandboxes')
        .withIndex('by_owner', q => q.eq('owner', 'a@x'))
        .collect()
    )
    expect(rows.length).toBe(1)
    expect(rows[0]?.sandboxId).toBe('sb1')
  })
})
describe('sandboxes.remove sandboxId-scoped', () => {
  test('removes when sandboxId matches', async () => {
    const t = makeTest()
    await t.mutation(internal.sandboxes.upsert, { owner: 'a@x', sandboxId: 'sb1' })
    await t.mutation(internal.sandboxes.remove, { owner: 'a@x', sandboxId: 'sb1' })
    const row = await t.query(internal.sandboxes.getByOwner, { owner: 'a@x' })
    expect(row).toBeNull()
  })
  test('does NOT remove when sandboxId mismatches (concurrent upsert protection)', async () => {
    const t = makeTest()
    await t.mutation(internal.sandboxes.upsert, { owner: 'a@x', sandboxId: 'sb1' })
    await t.mutation(internal.sandboxes.remove, { owner: 'a@x', sandboxId: 'sb-other' })
    const row = await t.query(internal.sandboxes.getByOwner, { owner: 'a@x' })
    expect(row?.sandboxId).toBe('sb1')
  })
  test('omitting sandboxId removes any incumbent (legacy callers)', async () => {
    const t = makeTest()
    await t.mutation(internal.sandboxes.upsert, { owner: 'a@x', sandboxId: 'sb1' })
    await t.mutation(internal.sandboxes.remove, { owner: 'a@x' })
    const row = await t.query(internal.sandboxes.getByOwner, { owner: 'a@x' })
    expect(row).toBeNull()
  })
  test('no-op when no row exists', async () => {
    const t = makeTest()
    await t.mutation(internal.sandboxes.remove, { owner: 'ghost@x', sandboxId: 'sb1' })
    const row = await t.query(internal.sandboxes.getByOwner, { owner: 'ghost@x' })
    expect(row).toBeNull()
  })
})
describe('sandboxes.touch', () => {
  test('updates lastUsedAt of existing row', async () => {
    const t = makeTest()
    await t.run(async ctx => {
      await ctx.db.insert('sandboxes', { lastUsedAt: 100, owner: 'a@x', sandboxId: 'sb1' })
    })
    await t.mutation(internal.sandboxes.touch, { owner: 'a@x' })
    const row = await t.query(internal.sandboxes.getByOwner, { owner: 'a@x' })
    expect(row?.lastUsedAt ?? 0).toBeGreaterThan(100)
  })
  test('no-op when no row exists', async () => {
    const t = makeTest()
    await t.mutation(internal.sandboxes.touch, { owner: 'ghost@x' })
    const row = await t.query(internal.sandboxes.getByOwner, { owner: 'ghost@x' })
    expect(row).toBeNull()
  })
})
describe('sandboxes.listStale', () => {
  test('returns rows with lastUsedAt < cutoff (24h)', async () => {
    const t = makeTest()
    const fresh = Date.now()
    const stale = Date.now() - 25 * 60 * 60 * 1000
    await t.run(async ctx => {
      await ctx.db.insert('sandboxes', { lastUsedAt: fresh, owner: 'fresh@x', sandboxId: 'sb-fresh' })
      await ctx.db.insert('sandboxes', { lastUsedAt: stale, owner: 'stale@x', sandboxId: 'sb-stale' })
    })
    const list = await t.query(internal.sandboxes.listStale, {})
    expect(list.length).toBe(1)
    expect(list[0]?.sandboxId).toBe('sb-stale')
  })
  test('empty when no stale rows', async () => {
    const t = makeTest()
    await t.run(async ctx => {
      await ctx.db.insert('sandboxes', { lastUsedAt: Date.now(), owner: 'a@x', sandboxId: 'sb1' })
    })
    const list = await t.query(internal.sandboxes.listStale, {})
    expect(list.length).toBe(0)
  })
})
describe('chats.countStreaming', () => {
  test('counts streaming chats for owner', async () => {
    const t = makeTest()
    await t.run(async ctx => {
      const now = Date.now()
      const insert = async (streaming: boolean): Promise<void> => {
        await ctx.db.insert('chats', {
          messageCount: 0,
          owner: 'cs@x',
          secretHash: 'h'.repeat(64),
          streaming,
          streamingStartedAt: now,
          title: 't',
          turns: 1,
          updatedAt: now
        })
      }
      await insert(true)
      await insert(true)
      await insert(false)
    })
    const count = await t.query(internal.chats.countStreaming, { owner: 'cs@x' })
    expect(count).toBe(2)
  })
  test('zero for owner with no chats', async () => {
    const t = makeTest()
    const count = await t.query(internal.chats.countStreaming, { owner: 'nobody@x' })
    expect(count).toBe(0)
  })
  test('excludes soft-deleted chats', async () => {
    const t = makeTest()
    await t.run(async ctx => {
      await ctx.db.insert('chats', {
        deletedAt: Date.now(),
        messageCount: 0,
        owner: 'sd@x',
        secretHash: 'h'.repeat(64),
        streaming: true,
        streamingStartedAt: Date.now(),
        title: 't',
        turns: 1,
        updatedAt: Date.now()
      })
    })
    const count = await t.query(internal.chats.countStreaming, { owner: 'sd@x' })
    expect(count).toBe(0)
  })
})
