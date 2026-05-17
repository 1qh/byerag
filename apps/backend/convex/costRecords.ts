/* oxlint-disable eslint(no-unused-vars) */
/** biome-ignore-all lint/nursery/noContinue: control flow shape */
/** biome-ignore-all lint/nursery/noShadow: scoped shadows ok */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential by design */
/** biome-ignore-all lint/performance/useTopLevelRegex: scoped regex ok */
/** biome-ignore-all lint/style/useExplicitLengthCheck: idiomatic */
/** biome-ignore-all lint/correctness/noUnusedVariables: pending feature */
import { v } from 'convex/values'
import type { MutationCtx } from './_generated/server'
import { internalMutation } from './_generated/server'
import { computeActualCents } from './messages/streamHelpers'
const dayKey = (epochMs: number): string => {
  const d = new Date(epochMs)
  const y = d.getUTCFullYear()
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0')
  const day = d.getUTCDate().toString().padStart(2, '0')
  return `${y}-${m}-${day}`
}
interface UpsertArgs {
  cacheCreationInputTokens: number
  cacheReadInputTokens: number
  cents: number
  inputTokens: number
  model: string
  outputTokens: number
  owner: string
}
const applyUpsert = async (ctx: MutationCtx, args: UpsertArgs): Promise<void> => {
  const k = dayKey(Date.now())
  // biome-ignore lint/nursery/noPlaywrightUselessAwait: Convex .first() returns thenable
  const existing = await ctx.db
    .query('costRecords')
    .withIndex('by_owner_model_dayKey', q => q.eq('owner', args.owner).eq('model', args.model).eq('dayKey', k))
    .first()
  await (existing
    ? ctx.db.patch(existing._id, {
        cacheCreationInputTokens: existing.cacheCreationInputTokens + args.cacheCreationInputTokens,
        cacheReadInputTokens: existing.cacheReadInputTokens + args.cacheReadInputTokens,
        callCount: existing.callCount + 1,
        cents: existing.cents + args.cents,
        inputTokens: existing.inputTokens + args.inputTokens,
        outputTokens: existing.outputTokens + args.outputTokens
      })
    : ctx.db.insert('costRecords', {
        cacheCreationInputTokens: args.cacheCreationInputTokens,
        cacheReadInputTokens: args.cacheReadInputTokens,
        callCount: 1,
        cents: args.cents,
        dayKey: k,
        inputTokens: args.inputTokens,
        model: args.model,
        outputTokens: args.outputTokens,
        owner: args.owner
      }))
}
const upsert = internalMutation({
  args: {
    cacheCreationInputTokens: v.number(),
    cacheReadInputTokens: v.number(),
    cents: v.number(),
    inputTokens: v.number(),
    model: v.string(),
    outputTokens: v.number(),
    owner: v.string()
  },
  handler: async (ctx, args): Promise<void> => applyUpsert(ctx, args)
})
const recordDirect = internalMutation({
  args: {
    cacheCreationInputTokens: v.optional(v.number()),
    cacheReadInputTokens: v.optional(v.number()),
    inputTokens: v.number(),
    model: v.optional(v.string()),
    outputTokens: v.number(),
    owner: v.optional(v.string())
  },
  handler: async (ctx, a): Promise<void> => {
    const model = a.model ?? 'kimi-for-coding'
    const cacheCreationInputTokens = a.cacheCreationInputTokens ?? 0
    const cacheReadInputTokens = a.cacheReadInputTokens ?? 0
    const cents = computeActualCents({
      cacheCreationInputTokens,
      cacheReadInputTokens,
      inputTokens: a.inputTokens,
      model,
      outputTokens: a.outputTokens
    })
    await applyUpsert(ctx, {
      cacheCreationInputTokens,
      cacheReadInputTokens,
      cents,
      inputTokens: a.inputTokens,
      model,
      outputTokens: a.outputTokens,
      owner: a.owner ?? 'system'
    })
  }
})
export { recordDirect, upsert }
