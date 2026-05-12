import { describe, expect, it } from 'bun:test'
import { makeTest } from '../../../test-utils/convex'
import { internal } from '../../_generated/api'
interface InitResponse {
  deviceCode: string
  expiresAt: number
  pollIntervalMs: number
  userCode: string
}
interface PollResponse {
  error?: string
  status?: 'authorized' | 'denied' | 'expired' | 'pending'
  token?: null | string
  userId?: null | string
}
describe('device flow', () => {
  it('init returns deviceCode + userCode, poll pending until authorized', async () => {
    const t = makeTest()
    const initRes = await t.fetch('/api/cli/device/init', {
      body: JSON.stringify({ label: 'integration-test' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(initRes.status).toBe(200)
    const init = (await initRes.json()) as InitResponse
    expect(init.deviceCode).toBeTruthy()
    expect(init.userCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/u)
    const poll1Res = await t.fetch('/api/cli/device/poll', {
      body: JSON.stringify({ deviceCode: init.deviceCode }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(poll1Res.status).toBe(200)
    const poll1 = (await poll1Res.json()) as PollResponse
    expect(poll1.status).toBe('pending')
    await t.mutation(internal.tools._app.cliAuth.authorizeDeviceCode, {
      plaintextToken: 'cli_test_token_xyz',
      tokenLabel: 'integration-test',
      userCode: init.userCode,
      userId: 'user_test_123'
    })
    const poll2Res = await t.fetch('/api/cli/device/poll', {
      body: JSON.stringify({ deviceCode: init.deviceCode }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(poll2Res.status).toBe(200)
    const poll2 = (await poll2Res.json()) as PollResponse
    expect(poll2.status).toBe('authorized')
    expect(poll2.token).toBe('cli_test_token_xyz')
    expect(poll2.userId).toBe('user_test_123')
    const poll3Res = await t.fetch('/api/cli/device/poll', {
      body: JSON.stringify({ deviceCode: init.deviceCode }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    })
    const poll3 = (await poll3Res.json()) as PollResponse
    expect(poll3.token).toBeNull()
  })
  it('unknown deviceCode returns 404', async () => {
    const t = makeTest()
    const res = await t.fetch('/api/cli/device/poll', {
      body: JSON.stringify({ deviceCode: 'nonexistent-device-code' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    })
    expect(res.status).toBe(404)
  })
})
