import { setHermeticAdapter } from '@a/cli'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { makeTest } from '../../../test-utils/convex'

beforeEach(() => {
  process.env.X_API_KEY = 'correct'
})
afterEach(() => {
  setHermeticAdapter(null)
  delete process.env.X_API_KEY
})
describe('aPI key auth', () => {
  it('x-Api-Key header works like Bearer', async () => {
    setHermeticAdapter(() => ({ hits: [] }))
    const t = makeTest()
    const res = await t.fetch('/api/cli/exec', {
      body: JSON.stringify({ args: { msg: 'x' }, path: ['test', 'echo'] }),
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': 'correct' },
      method: 'POST'
    })
    expect(res.status).toBe(200)
  })
  it('wrong bearer → 401 UNAUTHORIZED', async () => {
    const t = makeTest()
    const res = await t.fetch('/api/cli/exec', {
      body: JSON.stringify({ args: { msg: 'x' }, path: ['test', 'echo'] }),
      headers: { Authorization: 'Bearer wrong', 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(res.status).toBe(401)
  })
})
