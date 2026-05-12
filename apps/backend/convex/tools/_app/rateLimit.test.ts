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
describe('dispatch rate limit', () => {
  it('user exceeding RATE_MAX_USER → RATE_LIMITED 429', async () => {
    setHermeticAdapter(() => ({ hits: [] }))
    const t = makeTest()
    const now = Date.now()
    await t.run(async ctx => {
      const keyHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('k'))
      const hex = [...new Uint8Array(keyHash)].map(b => b.toString(16).padStart(2, '0')).join('')
      await ctx.db.insert('rateLimits', {
        owner: `x:user:token-${hex.slice(0, 32)}`,
        refilledAt: now,
        tokens: 0,
        updatedAt: now
      })
    })
    const res = await t.fetch('/api/cli/exec', {
      body: JSON.stringify({ args: { msg: 'x' }, path: ['test', 'echo'] }),
      headers: { Authorization: 'Bearer k', 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(res.status).toBe(429)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('RATE_LIMITED')
  })
})
