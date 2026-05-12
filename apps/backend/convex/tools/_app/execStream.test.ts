/** biome-ignore-all lint/style/noProcessEnv: test setup */
/** biome-ignore-all lint/nursery/noUndeclaredEnvVars: test env */
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
const readNdjson = async (res: Response): Promise<Record<string, unknown>[]> => {
  const text = await res.text()
  return text
    .split('\n')
    .filter(l => l.length > 0)
    .map(l => JSON.parse(l) as Record<string, unknown>)
}
describe('exec-stream endpoint', () => {
  it('emits started + complete envelope for valid command', async () => {
    setHermeticAdapter(() => ({ hits: [] }))
    const t = makeTest()
    const res = await t.fetch('/api/cli/exec-stream', {
      body: JSON.stringify({ args: { msg: 'hi' }, path: ['test', 'echo'] }),
      headers: { Authorization: 'Bearer dev-alice@example.com', 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/x-ndjson')
    const events = await readNdjson(res)
    expect(events.length).toBe(2)
    expect(events[0]?.kind).toBe('started')
    expect(events[0]?.runId).toMatch(/^r_/u)
    expect(events[1]?.kind).toBe('complete')
  })
  it('unknown command returns 404 JSON (not stream)', async () => {
    const t = makeTest()
    const res = await t.fetch('/api/cli/exec-stream', {
      body: JSON.stringify({ args: {}, path: ['nope', 'nope'] }),
      headers: { Authorization: 'Bearer dev-alice@example.com', 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(res.status).toBe(404)
  })
  it('missing bearer → 401', async () => {
    const t = makeTest()
    const res = await t.fetch('/api/cli/exec-stream', {
      body: JSON.stringify({ args: {}, path: ['test', 'echo'] }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(res.status).toBe(401)
  })
})
