import { v } from 'convex/values'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { internalMutation, internalQuery, mutation, query } from './_generated/server'
import { getOwnerEmailOrNull, requireOwnerEmail } from './authHelpers'
const profileFields = {
  addresses: v.array(v.object({ country: v.string(), name: v.string() })),
  agreedAt: v.optional(v.number()),
  businessType: v.union(v.literal('export'), v.literal('import')),
  company: v.optional(v.string()),
  companyDescription: v.optional(v.string()),
  companyLinkedin: v.optional(v.string()),
  description: v.optional(v.string()),
  imageId: v.optional(v.id('_storage')),
  industries: v.array(v.string()),
  job: v.optional(v.string()),
  mails: v.array(v.string()),
  note: v.optional(v.string()),
  onboardedAt: v.optional(v.number()),
  phones: v.array(v.string()),
  preferredLanguage: v.optional(v.string()),
  role: v.optional(v.string()),
  signature: v.optional(v.string()),
  socials: v.array(v.object({ platform: v.string(), url: v.string() })),
  sources: v.array(v.string()),
  targets: v.array(v.string()),
  userLinkedin: v.optional(v.string()),
  websites: v.array(v.string())
}
const profilePatch = v.object({
  addresses: v.optional(profileFields.addresses),
  agreedAt: v.optional(v.number()),
  businessType: v.optional(profileFields.businessType),
  company: v.optional(v.string()),
  companyDescription: v.optional(v.string()),
  companyLinkedin: v.optional(v.string()),
  description: v.optional(v.string()),
  imageId: v.optional(v.id('_storage')),
  industries: v.optional(profileFields.industries),
  job: v.optional(v.string()),
  mails: v.optional(profileFields.mails),
  note: v.optional(v.string()),
  onboardedAt: v.optional(v.number()),
  phones: v.optional(profileFields.phones),
  preferredLanguage: v.optional(v.string()),
  role: v.optional(v.string()),
  signature: v.optional(v.string()),
  socials: v.optional(profileFields.socials),
  sources: v.optional(profileFields.sources),
  targets: v.optional(profileFields.targets),
  userLinkedin: v.optional(v.string()),
  websites: v.optional(profileFields.websites)
})
const findProfileForUser = async (ctx: MutationCtx | QueryCtx, userId: string) =>
  ctx.db
    .query('profiles')
    .withIndex('by_user', q => q.eq('userId', userId))
    .first()
const getByUser = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => findProfileForUser(ctx, userId)
})
const upsertForUser = internalMutation({
  args: { patch: profilePatch, userId: v.string() },
  handler: async (ctx, { patch, userId }) => {
    const existing = await findProfileForUser(ctx, userId)
    const now = Date.now()
    if (existing) {
      await ctx.db.patch(existing._id, { ...patch, updatedAt: now })
      return existing._id
    }
    const id = await ctx.db.insert('profiles', {
      addresses: patch.addresses ?? [],
      agreedAt: patch.agreedAt,
      businessType: patch.businessType ?? 'export',
      company: patch.company,
      companyDescription: patch.companyDescription,
      companyLinkedin: patch.companyLinkedin,
      description: patch.description,
      imageId: patch.imageId,
      industries: patch.industries ?? [],
      job: patch.job,
      mails: patch.mails ?? [],
      note: patch.note,
      onboardedAt: patch.onboardedAt,
      phones: patch.phones ?? [],
      preferredLanguage: patch.preferredLanguage,
      role: patch.role,
      signature: patch.signature,
      socials: patch.socials ?? [],
      sources: patch.sources ?? [],
      targets: patch.targets ?? [],
      updatedAt: now,
      userId,
      userLinkedin: patch.userLinkedin,
      websites: patch.websites ?? []
    })
    return id
  }
})
interface DerivedPrompts {
  prompts: string[]
}
interface PromptInputs {
  industries: string[]
  products: string[]
  starredCorridors: string[]
  targets: string[]
}
const buildPrompts = ({ industries, products, starredCorridors, targets }: PromptInputs): string[] => {
  const out: string[] = []
  for (const name of starredCorridors.slice(0, 3)) out.push(`find buyers in @corridor:${name}`)
  const product = products[0] ?? industries[0] ?? 'my product'
  const market = targets[0] ?? 'EU'
  out.push(`find buyers in ${market} for ${product}`)
  if (targets.length > 1) out.push(`find importers across ${targets.slice(0, 3).join(', ')} for ${product}`)
  if (industries.length > 0) out.push(`who's a major ${industries[0]} importer in Europe`)
  out.push(`tariff on ${product} into ${market}`)
  if (products.length > 1) out.push(`find buyers for ${products[1]}`)
  out.push('draft a cold-outreach email for next batch of leads')
  out.push('list my collections')
  return out.slice(0, 6)
}
const myAgreedAt = query({
  args: {},
  handler: async (ctx): Promise<null | number> => {
    const userId = await getOwnerEmailOrNull(ctx)
    if (!userId) return null
    const profile = await findProfileForUser(ctx, userId)
    return profile?.agreedAt ?? null
  }
})
const acceptTos = mutation({
  args: {},
  handler: async (ctx): Promise<{ ok: true }> => {
    const userId = await requireOwnerEmail(ctx)
    const profile = await findProfileForUser(ctx, userId)
    const now = Date.now()
    if (profile) {
      await ctx.db.patch(profile._id, { agreedAt: now, updatedAt: now })
      return { ok: true }
    }
    await ctx.db.insert('profiles', {
      addresses: [],
      agreedAt: now,
      businessType: 'export',
      industries: [],
      mails: [],
      phones: [],
      socials: [],
      sources: [],
      targets: [],
      updatedAt: now,
      userId,
      websites: []
    })
    return { ok: true }
  }
})
const myStarterPrompts = query({
  args: {},
  handler: async (ctx): Promise<DerivedPrompts> => {
    const userId = await getOwnerEmailOrNull(ctx)
    if (!userId) return { prompts: [] }
    const profile = await findProfileForUser(ctx, userId)
    if (!profile) return { prompts: [] }
    const productDocs = await ctx.db
      .query('userProducts')
      .withIndex('by_user', q => q.eq('userId', userId))
      .collect()
    const products = productDocs.flatMap(p => (p.name ? [p.name] : []))
    const corridorDocs = await ctx.db
      .query('corridors')
      .withIndex('by_user', q => q.eq('userId', userId))
      .collect()
    const starredCorridors = corridorDocs
      .filter(c => typeof c.starredAt === 'number')
      .toSorted((a, b) => (b.starredAt ?? 0) - (a.starredAt ?? 0))
      .map(c => c.name)
    return {
      prompts: buildPrompts({ industries: profile.industries, products, starredCorridors, targets: profile.targets })
    }
  }
})
const myTooltipDismissals = query({
  args: {},
  handler: async (ctx): Promise<string[]> => {
    const userId = await getOwnerEmailOrNull(ctx)
    if (!userId) return []
    const profile = await findProfileForUser(ctx, userId)
    return profile?.tooltipDismissals ?? []
  }
})
const dismissTooltip = mutation({
  args: { key: v.string() },
  handler: async (ctx, { key }): Promise<{ ok: true }> => {
    const userId = await requireOwnerEmail(ctx)
    const profile = await findProfileForUser(ctx, userId)
    const now = Date.now()
    if (profile) {
      const existing = profile.tooltipDismissals ?? []
      if (!existing.includes(key))
        await ctx.db.patch(profile._id, { tooltipDismissals: [...existing, key], updatedAt: now })
      return { ok: true }
    }
    await ctx.db.insert('profiles', {
      addresses: [],
      businessType: 'export',
      industries: [],
      mails: [],
      phones: [],
      socials: [],
      sources: [],
      targets: [],
      tooltipDismissals: [key],
      updatedAt: now,
      userId,
      websites: []
    })
    return { ok: true }
  }
})
export { acceptTos, dismissTooltip, getByUser, myAgreedAt, myStarterPrompts, myTooltipDismissals, upsertForUser }
