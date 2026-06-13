/** biome-ignore-all lint/suspicious/noUndeclaredEnvVars: test env */
import { setHermeticAdapter } from '@a/cli'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { makeTest } from '../../../test-utils/convex'

beforeEach(() => {
  process.env.ALLOW_DEV_TOKENS = '1'
})
afterEach(() => {
  setHermeticAdapter(null)
  delete process.env.ALLOW_DEV_TOKENS
})
describe('dev-token auth', () => {
  it('bearer dev-<email> accepted when ALLOW_DEV_TOKENS=1', async () => {
    setHermeticAdapter(() => ({ hits: [] }))
    const t = makeTest()
    const res = await t.fetch('/api/cli/exec', {
      body: JSON.stringify({ args: { msg: 'x' }, path: ['test', 'echo'] }),
      headers: { Authorization: 'Bearer dev-alice@example.com', 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(res.status).toBe(200)
  })
  it('bearer dev-<email> rejected when ALLOW_DEV_TOKENS unset', async () => {
    delete process.env.ALLOW_DEV_TOKENS
    const t = makeTest()
    const res = await t.fetch('/api/cli/exec', {
      body: JSON.stringify({ args: { msg: 'x' }, path: ['test', 'echo'] }),
      headers: { Authorization: 'Bearer dev-alice@example.com', 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(res.status).toBe(401)
  })
  it('bearer dev- with empty email → 401', async () => {
    const t = makeTest()
    const res = await t.fetch('/api/cli/exec', {
      body: JSON.stringify({ args: { msg: 'x' }, path: ['test', 'echo'] }),
      headers: { Authorization: 'Bearer dev-', 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(res.status).toBe(401)
  })
})
