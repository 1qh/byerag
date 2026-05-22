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
describe('/api/cli/exec happy path', () => {
  it('auth → validate → dispatch → 200 canonical body', async () => {
    setHermeticAdapter(() => ({ echoed: 'hi' }))
    const t = makeTest()
    const res = await t.fetch('/api/cli/exec', {
      body: JSON.stringify({ args: { msg: 'hi' }, path: ['test', 'echo'] }),
      headers: { Authorization: 'Bearer k', 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { _deprecated?: unknown; echoed: string }
    expect(body.echoed).toBe('hi')
    expect(body._deprecated).toBeUndefined()
  })
  it('unauthenticated → 401 UNAUTHORIZED', async () => {
    delete process.env.X_API_KEY
    const t = makeTest()
    const res = await t.fetch('/api/cli/exec', {
      body: JSON.stringify({ args: { msg: 'x' }, path: ['test', 'echo'] }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('UNAUTHORIZED')
  })
  it('invalid path → 404 NOT_FOUND with hint', async () => {
    const t = makeTest()
    const res = await t.fetch('/api/cli/exec', {
      body: JSON.stringify({ args: {}, path: ['test', 'nonexistent'] }),
      headers: { Authorization: 'Bearer k', 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: { code: string; details?: unknown } }
    expect(body.error.code).toBe('NOT_FOUND')
  })
})
