import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { makeTest } from '../../../test-utils/convex'
interface ManifestNode {
  children?: Record<string, ManifestNode>
  command?: {
    args: { name: string; required: boolean; type: string }[]
    cost: string
    description: string
    deteradminstic: boolean
    version: string
  }
  description?: string
  kind: 'command' | 'group' | 'provider'
}
beforeEach(() => {
  process.env.X_API_KEY = 'k'
})
afterEach(() => {
  delete process.env.X_API_KEY
})
describe('manifest tree', () => {
  it('admin manifest contains _test provider with expected commands', async () => {
    process.env.X_API_KEY = 'k'
    const t = makeTest().withIdentity({ issuer: 'x-cli', subject: 'dev' })
    const res = await t.fetch('/api/cli/manifest', {
      body: '{}',
      headers: { Authorization: 'Bearer k', 'Content-Type': 'application/json', 'X-Requested-By': 'test' },
      method: 'POST'
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { tree: Record<string, ManifestNode> }
    expect(body.tree.admin).toBeDefined()
    expect(body.tree.test).toBeDefined()
    const echo = body.tree.test?.children?.echo
    expect(echo?.kind).toBe('command')
    expect(echo?.command?.version).toBe('1')
    expect(echo?.command?.args.find(a => a.name === '--msg')).toBeDefined()
  })
})
