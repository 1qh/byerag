import { describe, expect, test } from 'bun:test'
import { makeTest } from '../test-utils/convex'
import { internal } from './_generated/api'

const seedSandbox = async (t: ReturnType<typeof makeTest>, owner: string, sandboxId: string): Promise<void> => {
  await t.run(async ctx => {
    await ctx.db.insert('sandboxes', { lastUsedAt: Date.now(), owner, sandboxId })
  })
}
const seedStreamingChat = async (t: ReturnType<typeof makeTest>, owner: string): Promise<void> => {
  await t.run(async ctx => {
    await ctx.db.insert('chats', {
      app: 'user',
      messageCount: 0,
      owner,
      secretHash: 'h'.repeat(64),
      streaming: true,
      streamingStartedAt: Date.now(),
      title: 't',
      turns: 1,
      updatedAt: Date.now()
    })
  })
}
describe('sandboxKill.kill — gate behavior', () => {
  test('skips kill+remove when liveCount > 0 (shared sandbox preservation)', async () => {
    const t = makeTest()
    const owner = 'shared@x'
    await seedSandbox(t, owner, 'sb-shared')
    await seedStreamingChat(t, owner)
    await t.action(internal.sandboxKill.kill, { owner, sandboxId: 'sb-shared' })
    const row = await t.query(internal.sandboxes.getByOwner, { owner })
    expect(row?.sandboxId).toBe('sb-shared')
  })
  test('gate evaluates incumbent sandboxId mismatch separately from liveCount', async () => {
    const t = makeTest()
    const owner = 'rotated@x'
    await seedSandbox(t, owner, 'sb-current')
    await seedStreamingChat(t, owner)
    await t.action(internal.sandboxKill.kill, { owner, sandboxId: 'sb-stale' }).catch(() => undefined)
    const row = await t.query(internal.sandboxes.getByOwner, { owner })
    expect(row?.sandboxId).toBe('sb-current')
  })
})
describe('sandboxKill.pruneStaleAndKill — listStale gate', () => {
  test('no-op when no stale rows', async () => {
    const t = makeTest()
    await t.action(internal.sandboxKill.pruneStaleAndKill, {})
    const rows = await t.run(async ctx => ctx.db.query('sandboxes').collect())
    expect(rows).toHaveLength(0)
  })
  test('preserves fresh (non-stale) sandbox rows', async () => {
    const t = makeTest()
    await t.run(async ctx => {
      await ctx.db.insert('sandboxes', { lastUsedAt: Date.now(), owner: 'fresh@x', sandboxId: 'sb-fresh' })
    })
    await t.action(internal.sandboxKill.pruneStaleAndKill, {})
    const row = await t.query(internal.sandboxes.getByOwner, { owner: 'fresh@x' })
    expect(row?.sandboxId).toBe('sb-fresh')
  })
})
