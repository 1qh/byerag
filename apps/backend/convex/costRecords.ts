/* eslint-disable @typescript-eslint/max-params, @typescript-eslint/no-shadow, @typescript-eslint/no-deprecated, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/use-unknown-in-catch-callback-variable, no-await-in-loop, no-continue, no-shadow, no-useless-assignment, unicorn/prefer-ternary, unicorn/no-new-array, unicorn/prefer-array-find -- pre-launch lint baseline; not catching real bugs */
/** biome-ignore-all lint/nursery/noContinue: control flow shape */
/** biome-ignore-all lint/nursery/noShadow: scoped shadows ok */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential by design */
/** biome-ignore-all lint/performance/useTopLevelRegex: scoped regex ok */
/** biome-ignore-all lint/style/useExplicitLengthCheck: idiomatic */
/** biome-ignore-all lint/correctness/noUnusedVariables: pending feature */
import { v } from 'convex/values'
import { internalMutation } from './_generated/server'
const dayKey = (epochMs: number): string => {
  const d = new Date(epochMs)
  const y = d.getUTCFullYear()
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0')
  const day = d.getUTCDate().toString().padStart(2, '0')
  return `${y}-${m}-${day}`
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
  handler: async (ctx, args): Promise<void> => {
    const k = dayKey(Date.now())
    // biome-ignore lint/nursery/noPlaywrightUselessAwait: Convex .first() returns thenable
    const existing = await ctx.db
      .query('costRecords')
      .withIndex('by_owner_model_dayKey', q => q.eq('owner', args.owner).eq('model', args.model).eq('dayKey', k))
      .first()
    if (existing)
      await ctx.db.patch(existing._id, {
        cacheCreationInputTokens: existing.cacheCreationInputTokens + args.cacheCreationInputTokens,
        cacheReadInputTokens: existing.cacheReadInputTokens + args.cacheReadInputTokens,
        callCount: existing.callCount + 1,
        cents: existing.cents + args.cents,
        inputTokens: existing.inputTokens + args.inputTokens,
        outputTokens: existing.outputTokens + args.outputTokens
      })
    else
      await ctx.db.insert('costRecords', {
        cacheCreationInputTokens: args.cacheCreationInputTokens,
        cacheReadInputTokens: args.cacheReadInputTokens,
        callCount: 1,
        cents: args.cents,
        dayKey: k,
        inputTokens: args.inputTokens,
        model: args.model,
        outputTokens: args.outputTokens,
        owner: args.owner
      })
  }
})
export { upsert }
