import { setHermeticAdapter } from '@a/cli'
import { afterEach, describe, expect, it } from 'bun:test'
import { makeTest } from '../../../test-utils/convex'
import { internal } from '../../_generated/api'

afterEach(() => {
  setHermeticAdapter(null)
})
describe('cliToken auth', () => {
  it('valid token in cliTokens table → 200; revoked → 401', async () => {
    setHermeticAdapter(() => ({ hits: [] }))
    const t = makeTest()
    const plaintext = 'cli_token_test_abc123'
    await t.mutation(internal.tools._app.cliAuth.mintPatToken, {
      plaintextToken: plaintext,
      tokenLabel: 'integration-test',
      userId: 'user_xyz'
    })
    const okRes = await t.fetch('/api/cli/exec', {
      body: JSON.stringify({ args: { msg: 'x' }, path: ['test', 'echo'] }),
      headers: { Authorization: `Bearer ${plaintext}`, 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(okRes.status).toBe(200)
    const tokenHash = await (await import('../../secretHash')).hashSecret(plaintext)
    await t.mutation(internal.tools._app.cliAuth.revokeTokenByHash, { tokenHash, userId: 'user_xyz' })
    const revokedRes = await t.fetch('/api/cli/exec', {
      body: JSON.stringify({ args: { msg: 'x' }, path: ['test', 'echo'] }),
      headers: { Authorization: `Bearer ${plaintext}`, 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(revokedRes.status).toBe(401)
  })
  it('unknown token → 401', async () => {
    const t = makeTest()
    const res = await t.fetch('/api/cli/exec', {
      body: JSON.stringify({ args: { msg: 'x' }, path: ['test', 'echo'] }),
      headers: { Authorization: 'Bearer cli_unknown_token', 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(res.status).toBe(401)
  })
})
