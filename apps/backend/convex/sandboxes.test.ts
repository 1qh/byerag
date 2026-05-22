import { describe, expect, it } from 'bun:test'
import { makeTest } from '../test-utils/convex'
import { internal } from './_generated/api'

describe('sandboxes', () => {
  it('getByOwner returns null when no record', async () => {
    const t = makeTest()
    const r = await t.query(internal.sandboxes.getByOwner, { owner: 'a@b.c' })
    expect(r).toBeNull()
  })
  it('upsert inserts new record', async () => {
    const t = makeTest()
    await t.mutation(internal.sandboxes.upsert, { owner: 'a@b.c', sandboxId: 'sb1' })
    const r = await t.query(internal.sandboxes.getByOwner, { owner: 'a@b.c' })
    expect(r?.sandboxId).toBe('sb1')
  })
  it('upsert rejects second sandbox; incumbent wins', async () => {
    const t = makeTest()
    const r1 = await t.mutation(internal.sandboxes.upsert, { owner: 'a@b.c', sandboxId: 'sb1' })
    expect(r1.accepted).toBe(true)
    const r2 = await t.mutation(internal.sandboxes.upsert, { owner: 'a@b.c', sandboxId: 'sb2' })
    expect(r2.accepted).toBe(false)
    expect(r2.existingSandboxId).toBe('sb1')
    const r = await t.query(internal.sandboxes.getByOwner, { owner: 'a@b.c' })
    expect(r?.sandboxId).toBe('sb1')
  })
  it('upsert scoped per owner', async () => {
    const t = makeTest()
    await t.mutation(internal.sandboxes.upsert, { owner: 'a@b.c', sandboxId: 'sbA' })
    await t.mutation(internal.sandboxes.upsert, { owner: 'x@y.z', sandboxId: 'sbX' })
    const a = await t.query(internal.sandboxes.getByOwner, { owner: 'a@b.c' })
    const x = await t.query(internal.sandboxes.getByOwner, { owner: 'x@y.z' })
    expect(a?.sandboxId).toBe('sbA')
    expect(x?.sandboxId).toBe('sbX')
  })
  it('remove deletes record', async () => {
    const t = makeTest()
    await t.mutation(internal.sandboxes.upsert, { owner: 'a@b.c', sandboxId: 'sb1' })
    await t.mutation(internal.sandboxes.remove, { owner: 'a@b.c' })
    const r = await t.query(internal.sandboxes.getByOwner, { owner: 'a@b.c' })
    expect(r).toBeNull()
  })
  it('remove no-op when missing', async () => {
    const t = makeTest()
    await expect(t.mutation(internal.sandboxes.remove, { owner: 'nobody@x.c' })).resolves.toBeNull()
  })
  it('remove only affects target owner', async () => {
    const t = makeTest()
    await t.mutation(internal.sandboxes.upsert, { owner: 'a@b.c', sandboxId: 'sbA' })
    await t.mutation(internal.sandboxes.upsert, { owner: 'x@y.z', sandboxId: 'sbX' })
    await t.mutation(internal.sandboxes.remove, { owner: 'a@b.c' })
    const x = await t.query(internal.sandboxes.getByOwner, { owner: 'x@y.z' })
    expect(x?.sandboxId).toBe('sbX')
  })
})
