/** biome-ignore-all lint/performance/noAwaitInLoops: sequential sandbox kills */
/* eslint-disable no-await-in-loop */
/* oxlint-disable eslint(no-await-in-loop) */
'use node'
import { v } from 'convex/values'
import { internal } from './_generated/api'
import { internalAction } from './_generated/server'
import { killSandbox } from './sandboxClient'
const KILL_NOT_FOUND_RE = /404|not.{0,3}found|no such/iu
const killOne = async (sandboxId: string): Promise<{ done: boolean; reason?: string }> => {
  try {
    await killSandbox(sandboxId)
    return { done: true }
  } catch (caughtError) {
    const msg = caughtError instanceof Error ? caughtError.message : String(caughtError)
    if (KILL_NOT_FOUND_RE.test(msg)) return { done: true, reason: msg }
    return { done: false, reason: msg }
  }
}
const kill = internalAction({
  args: { attempt: v.optional(v.number()), owner: v.string(), sandboxId: v.string() },
  handler: async (ctx, { owner, sandboxId, attempt }) => {
    const current: null | { sandboxId: string } = await ctx.runQuery(internal.sandboxes.getByOwner, { owner })
    if (current?.sandboxId === sandboxId) {
      const liveCount: number = await ctx.runQuery(internal.chats.countStreaming, { owner })
      if (liveCount > 0) return
    }
    const result = await killOne(sandboxId)
    if (result.done) {
      await ctx.runMutation(internal.sandboxes.remove, { owner, sandboxId })
      return
    }
    const next = (attempt ?? 0) + 1
    if (next >= 6) {
      // eslint-disable-next-line no-console
      console.error(
        JSON.stringify({ event: 'sandbox.kill.exhausted', level: 'error', owner, reason: result.reason, sandboxId })
      )
      return
    }
    await ctx.scheduler.runAfter(Math.min(60_000, 2 ** next * 1000), internal.sandboxKill.kill, {
      attempt: next,
      owner,
      sandboxId
    })
  }
})
const killOnly = internalAction({
  args: { attempt: v.optional(v.number()), sandboxId: v.string() },
  handler: async (ctx, { sandboxId, attempt }) => {
    const result = await killOne(sandboxId)
    if (result.done) return
    const next = (attempt ?? 0) + 1
    if (next < 6)
      await ctx.scheduler.runAfter(Math.min(60_000, 2 ** next * 1000), internal.sandboxKill.killOnly, {
        attempt: next,
        sandboxId
      })
  }
})
const pruneStaleAndKill = internalAction({
  args: {},
  handler: async ctx => {
    const stale: { owner: string; sandboxId: string }[] = await ctx.runQuery(internal.sandboxes.listStale, {})
    for (const r of stale) {
      const result = await killOne(r.sandboxId)
      await (result.done
        ? ctx.runMutation(internal.sandboxes.remove, { owner: r.owner, sandboxId: r.sandboxId })
        : ctx.scheduler.runAfter(2000, internal.sandboxKill.kill, {
            attempt: 1,
            owner: r.owner,
            sandboxId: r.sandboxId
          }))
    }
    if (stale.length >= 500) await ctx.scheduler.runAfter(2000, internal.sandboxKill.pruneStaleAndKill, {})
  }
})
export { kill, killOnly, pruneStaleAndKill }
