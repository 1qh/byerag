/** biome-ignore-all lint/style/noProcessEnv: TEST_SECRET standalone test env */
/** biome-ignore-all lint/complexity/useLiteralKeys: env bracket */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential E2B kill loop */
/* eslint-disable @typescript-eslint/dot-notation, no-await-in-loop */
/* oxlint-disable eslint(dot-notation), eslint(no-await-in-loop) */
'use node'
import { v } from 'convex/values'
import { Sandbox } from 'e2b'
import { internal } from './_generated/api'
import { action } from './_generated/server'
import { env } from './env'
import { constantTimeEqual } from './utils'
const verifyTestSecret = (secret: string) => {
  // biome-ignore lint/nursery/noUndeclaredEnvVars: NODE_ENV=test (in-process bun:test) OR ALLOW_TESTING_ENDPOINTS=1 (real backend opt-in)
  const allowed = process.env['NODE_ENV'] === 'test' || process.env['ALLOW_TESTING_ENDPOINTS'] === '1'
  if (!allowed) throw new Error('testing endpoints disabled (set ALLOW_TESTING_ENDPOINTS=1 on backend to enable)')
  const expected: string | undefined = process.env['TEST_SECRET']
  if (!expected) throw new Error('testing endpoints disabled (TEST_SECRET unset)')
  if (!constantTimeEqual(secret, expected)) throw new Error('invalid test secret')
}
const killAllSandboxes = action({
  args: { testSecret: v.string() },
  handler: async (ctx, { testSecret }): Promise<{ killed: number }> => {
    verifyTestSecret(testSecret)
    const rows: { owner: string; sandboxId: string }[] = await ctx.runQuery(internal.testing.listSandboxIds, {
      testSecret
    })
    let killed = 0
    const pager = Sandbox.list({ apiKey: env.E2B_API_KEY, query: { state: ['running', 'paused'] } })
    while (pager.hasNext) {
      const items = await pager.nextItems()
      for (const s of items)
        try {
          await Sandbox.kill(s.sandboxId, { apiKey: env.E2B_API_KEY })
          killed += 1
        } catch {
          /* Ignore */
        }
    }
    for (const r of rows) await ctx.runMutation(internal.sandboxes.remove, { owner: r.owner })
    await ctx.runMutation(internal.testing.clearStreamingFlagsInternal, { testSecret })
    return { killed }
  }
})
export { killAllSandboxes }
