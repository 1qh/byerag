/** biome-ignore-all lint/performance/noAwaitInLoops: sequential cache lookups */
/* eslint-disable no-await-in-loop, @typescript-eslint/max-params */
/* oxlint-disable eslint(no-await-in-loop) */
/* oxlint-disable eslint(max-params), eslint-plugin-unicorn(prefer-ternary) */
/** biome-ignore-all lint/complexity/useMaxParams: internal helper, 5 params clearer than opts bag */
import { v } from 'convex/values'
import type { ActionCtx } from '../../_generated/server'
import { internal } from '../../_generated/api'
import { internalMutation, internalQuery } from '../../_generated/server'
const TTL_MS = 24 * 60 * 60 * 1000
const hashString = async (s: string): Promise<string> => {
  const bytes = new TextEncoder().encode(s)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)]
    .slice(0, 12)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
const lookup = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }): Promise<null | string> => {
    const row = await ctx.db
      .query('xToolCache')
      .withIndex('by_key', q => q.eq('key', key))
      .unique()
    if (!row || row.expiresAt < Date.now()) return null
    return row.payload
  }
})
const pruneExpired = internalMutation({
  args: {},
  handler: async ctx => {
    const now = Date.now()
    const stale = await ctx.db
      .query('xToolCache')
      .withIndex('by_expires', q => q.lt('expiresAt', now))
      .take(500)
    for (const row of stale) await ctx.db.delete(row._id)
    if (stale.length >= 500) await ctx.scheduler.runAfter(1000, internal.tools._app.cache.pruneExpired, {})
    return { deleted: stale.length }
  }
})
const store = internalMutation({
  args: { key: v.string(), payload: v.string() },
  handler: async (ctx, { key, payload }) => {
    const existing = await ctx.db
      .query('xToolCache')
      .withIndex('by_key', q => q.eq('key', key))
      .unique()
    const expiresAt = Date.now() + TTL_MS
    await (existing
      ? ctx.db.patch(existing._id, { expiresAt, payload })
      : ctx.db.insert('xToolCache', { expiresAt, key, payload }))
  }
})
const stableStringify = (val: unknown, depth = 0): string => {
  if (depth > 10) return '"[TRUNCATED]"'
  if (val === null || typeof val !== 'object') return JSON.stringify(val ?? null)
  if (Array.isArray(val)) return `[${val.map(v0 => stableStringify(v0, depth + 1)).join(',')}]`
  const obj = val as Record<string, unknown>
  const keys = Object.keys(obj).toSorted()
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(obj[k], depth + 1)}`).join(',')}}`
}
const cacheKey = async (owner: string, mode: string, tool: string, args: unknown): Promise<string> =>
  `${owner}:${mode}:${tool}:${await hashString(stableStringify(args))}`
const cached = async <T>(
  ctx: ActionCtx,
  owner: string,
  mode: string,
  tool: string,
  args: unknown,
  compute: () => Promise<T>
): Promise<T> => {
  const key = await cacheKey(owner, mode, tool, args)
  const hit = await ctx.runQuery(internal.tools._app.cache.lookup, { key })
  if (hit !== null) return JSON.parse(hit) as T
  const val = await compute()
  await ctx.runMutation(internal.tools._app.cache.store, { key, payload: JSON.stringify(val) })
  return val
}
export { cached, cacheKey, lookup, pruneExpired, store }
