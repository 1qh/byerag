/** biome-ignore-all lint/nursery/noContinue: skip-no-company filter */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential per-collection-item enrichment query */
/* eslint-disable no-await-in-loop, no-continue */
import { v } from 'convex/values'
import type { Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { internalMutation, internalQuery, query } from './_generated/server'
import { getOwnerEmailOrNull } from './authHelpers'
const findByMail = async (ctx: MutationCtx | QueryCtx, mail: string) =>
  ctx.db
    .query('employees')
    .withIndex('by_mail', q => q.eq('mail', mail))
    .first()
const upsert = internalMutation({
  args: {
    apolloEmailStatus: v.optional(v.string()),
    ava: v.optional(v.string()),
    companyId: v.id('companies'),
    department: v.optional(v.string()),
    isLikelyToEngage: v.optional(v.boolean()),
    linkedinUrl: v.optional(v.string()),
    location: v.optional(v.string()),
    mail: v.string(),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    source: v.union(v.literal('apollo'), v.literal('salesql'), v.literal('manual')),
    title: v.optional(v.string())
  },
  handler: async (ctx, args): Promise<Id<'employees'>> => {
    const now = Date.now()
    const existing = await findByMail(ctx, args.mail)
    if (existing) {
      await ctx.db.patch(existing._id, {
        apolloEmailStatus: args.apolloEmailStatus ?? existing.apolloEmailStatus,
        ava: args.ava ?? existing.ava,
        companyId: args.companyId,
        department: args.department ?? existing.department,
        isLikelyToEngage: args.isLikelyToEngage ?? existing.isLikelyToEngage,
        linkedinUrl: args.linkedinUrl ?? existing.linkedinUrl,
        location: args.location ?? existing.location,
        name: args.name ?? existing.name,
        phone: args.phone ?? existing.phone,
        title: args.title ?? existing.title,
        updatedAt: now
      })
      return existing._id
    }
    return ctx.db.insert('employees', {
      apolloEmailStatus: args.apolloEmailStatus,
      ava: args.ava,
      companyId: args.companyId,
      department: args.department,
      emailStatus: 'inactive',
      isLikelyToEngage: args.isLikelyToEngage ?? false,
      linkedinUrl: args.linkedinUrl,
      location: args.location,
      mail: args.mail,
      name: args.name,
      phone: args.phone,
      source: args.source,
      title: args.title,
      updatedAt: now
    })
  }
})
const listByCompany = internalQuery({
  args: { companyId: v.id('companies') },
  handler: async (ctx, { companyId }) =>
    ctx.db
      .query('employees')
      .withIndex('by_company', q => q.eq('companyId', companyId))
      .collect()
})
const listByCollection = internalQuery({
  args: { collectionId: v.id('collections') },
  handler: async (ctx, { collectionId }) => {
    const items = await ctx.db
      .query('collectionItems')
      .withIndex('by_collection', q => q.eq('collectionId', collectionId))
      .collect()
    const out: { companyId: Id<'companies'>; employeeIds: Id<'employees'>[] }[] = []
    for (const item of items) {
      const emps = await ctx.db
        .query('employees')
        .withIndex('by_company', q => q.eq('companyId', item.companyId))
        .collect()
      out.push({ companyId: item.companyId, employeeIds: emps.map(e => e._id) })
    }
    return out
  }
})
const findCompanyByCanonicalUrl = internalQuery({
  args: { canonicalUrl: v.string() },
  handler: async (ctx, { canonicalUrl }) =>
    ctx.db
      .query('companies')
      .withIndex('by_canonicalUrl', q => q.eq('canonicalUrl', canonicalUrl))
      .first()
})
const findByIdInternal = internalQuery({
  args: { employeeId: v.id('employees') },
  handler: async (ctx, { employeeId }) => ctx.db.get(employeeId)
})
interface ContactRow {
  companyId: string
  companyName: string
  department?: string
  emailStatus: string
  isLikelyToEngage: boolean
  location?: string
  mail: string
  name?: string
  outreachStage: 'closing' | 'first-contact' | 'follow-up' | 'negotiation' | 'quote' | 'sample-request'
  sanctionsHit?: boolean
  source: 'apollo' | 'manual' | 'salesql'
  starred: boolean
  title?: string
}
const myCollectionContacts = query({
  args: { collectionId: v.id('collections') },
  handler: async (ctx, { collectionId }): Promise<ContactRow[]> => {
    const userId = await getOwnerEmailOrNull(ctx)
    if (!userId) return []
    const collection = await ctx.db.get(collectionId)
    if (collection?.userId !== userId) return []
    const items = await ctx.db
      .query('collectionItems')
      .withIndex('by_collection', q => q.eq('collectionId', collectionId))
      .collect()
    const contactBookmarks = await ctx.db
      .query('bookmarks')
      .withIndex('by_user_kind', q => q.eq('userId', userId).eq('kind', 'contact'))
      .collect()
    const starredMails = new Set(contactBookmarks.map(b => b.refId))
    const rows: ContactRow[] = []
    for (const item of items) {
      const company = await ctx.db.get(item.companyId)
      if (!company) continue
      const emps = await ctx.db
        .query('employees')
        .withIndex('by_company', q => q.eq('companyId', item.companyId))
        .collect()
      for (const e of emps)
        rows.push({
          companyId: company._id,
          companyName: company.name,
          department: e.department,
          emailStatus: e.emailStatus,
          isLikelyToEngage: e.isLikelyToEngage,
          location: e.location,
          mail: e.mail,
          name: e.name,
          outreachStage: item.outreachStage ?? 'first-contact',
          sanctionsHit: company.sanctionsHit,
          source: e.source,
          starred: starredMails.has(e.mail),
          title: e.title
        })
    }
    return rows
  }
})
export { findByIdInternal, findCompanyByCanonicalUrl, listByCollection, listByCompany, myCollectionContacts, upsert }
