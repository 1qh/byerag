import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { makeTest } from '../../../test-utils/convex'

beforeEach(() => {
  process.env.X_API_KEY = 'k'
})
afterEach(() => {
  delete process.env.X_API_KEY
})
interface FetchLike {
  fetch: (url: string, init: RequestInit) => Promise<Response>
}
const exec = async (t: FetchLike, path: string[], args: Record<string, unknown>) =>
  t.fetch('/api/cli/exec', {
    body: JSON.stringify({ args, path }),
    headers: { Authorization: 'Bearer k', 'Content-Type': 'application/json', 'X-Requested-By': 'test' },
    method: 'POST'
  })
describe('arg constraint violations surface via HTTP', () => {
  it('pattern violation: admin.debug.trace --trace-id mismatched format', async () => {
    const t = makeTest().withIdentity({ issuer: 'x-cli', subject: 'dev' })
    const res = await exec(t, ['admin', 'debug', 'trace'], { trace_id: 'nope' })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string; details?: { pattern?: string } } }
    expect(body.error.code).toBe('INVALID_ARG')
    expect(body.error.details?.pattern).toBeDefined()
  })
  it('limit max violation: admin.audit.recent limit > 100', async () => {
    const t = makeTest().withIdentity({ issuer: 'x-cli', subject: 'dev' })
    const res = await exec(t, ['admin', 'audit', 'recent'], { limit: 999 })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe('INVALID_ARG')
    expect(body.error.message.toLowerCase()).toContain('max')
  })
})
