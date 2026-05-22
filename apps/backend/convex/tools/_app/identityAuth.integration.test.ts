import { setHermeticAdapter } from '@a/cli'
import { describe, expect, it } from 'bun:test'
import { makeTest } from '../../../test-utils/convex'

describe('identity-based auth', () => {
  it('issuer=x-cli → admin tier (can call admin tools)', async () => {
    const t = makeTest().withIdentity({ issuer: 'x-cli', subject: 'dev' })
    const res = await t.fetch('/api/cli/exec', {
      body: JSON.stringify({ args: { limit: 5 }, path: ['admin', 'audit', 'recent'] }),
      headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'test' },
      method: 'POST'
    })
    expect(res.status).toBe(200)
  })
  it('non-x-cli issuer → user tier, admin tool rejected', async () => {
    const t = makeTest().withIdentity({ issuer: 'google', subject: 'alice' })
    const res = await t.fetch('/api/cli/exec', {
      body: JSON.stringify({ args: { limit: 5 }, path: ['admin', 'audit', 'recent'] }),
      headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'test' },
      method: 'POST'
    })
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('NOT_FOUND')
  })
  it('non-x-cli issuer → user tier, user tool accepted', async () => {
    setHermeticAdapter(() => ({ hits: [] }))
    const t = makeTest().withIdentity({ issuer: 'google', subject: 'alice' })
    const res = await t.fetch('/api/cli/exec', {
      body: JSON.stringify({ args: { msg: 'US' }, path: ['test', 'echo'] }),
      headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'test' },
      method: 'POST'
    })
    expect(res.status).toBe(200)
  })
})
