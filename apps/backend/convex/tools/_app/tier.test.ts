import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { makeTest } from '../../../test-utils/convex'
beforeEach(() => {
  process.env.X_API_KEY = 'user-key'
})
afterEach(() => {
  delete process.env.X_API_KEY
})
describe('tier enforcement', () => {
  it('user-tier auth calling admin tool → NOT_FOUND', async () => {
    const t = makeTest()
    const res = await t.fetch('/api/cli/exec', {
      body: JSON.stringify({ args: { limit: 5 }, path: ['admin', 'audit', 'recent'] }),
      headers: { Authorization: 'Bearer user-key', 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('NOT_FOUND')
  })
  it('user-tier manifest does not list admin provider', async () => {
    const t = makeTest()
    const res = await t.fetch('/api/cli/manifest', {
      body: JSON.stringify({}),
      headers: { Authorization: 'Bearer user-key', 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { tree: Record<string, unknown> }
    expect(body.tree.admin).toBeUndefined()
    expect(body.tree._admin).toBeUndefined()
  })
})
