import { setHermeticAdapter } from '@a/cli'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { makeTest } from '../../../test-utils/convex'
beforeEach(() => {
  process.env.X_API_KEY = 'k'
})
afterEach(() => {
  setHermeticAdapter(null)
  delete process.env.X_API_KEY
})
describe('xTraces truncation', () => {
  it('long args string truncated to 4000 chars', async () => {
    setHermeticAdapter(() => ({ hits: [] }))
    const t = makeTest()
    const big = 'x'.repeat(5000)
    await t.fetch('/api/cli/exec', {
      body: JSON.stringify({ args: { msg: big }, path: ['test', 'echo'] }),
      headers: { Authorization: 'Bearer k', 'Content-Type': 'application/json' },
      method: 'POST'
    })
    const rows = await t.run(async ctx => ctx.db.query('xTraces').collect())
    expect(rows[0]?.args.length).toBeLessThanOrEqual(4000)
  })
})
