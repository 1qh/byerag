/** biome-ignore-all lint/nursery/noContinue: kind-filter loop */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential per-kind lookup */
/* eslint-disable no-await-in-loop, no-continue */
import { v } from 'convex/values'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { internalQuery, query } from './_generated/server'
import { getOwnerEmailOrNull } from './authHelpers'
const ARTIFACT_KIND = v.union(
  v.literal('bookmark'),
  v.literal('collection'),
  v.literal('company'),
  v.literal('contact'),
  v.literal('corridor'),
  v.literal('knowledge'),
  v.literal('monitor'),
  v.literal('product'),
  v.literal('reminder'),
  v.literal('template')
)
type ArtifactKind =
  | 'bookmark'
  | 'collection'
  | 'company'
  | 'contact'
  | 'corridor'
  | 'knowledge'
  | 'monitor'
  | 'product'
  | 'reminder'
  | 'template'
interface ArtifactSummary {
  id: string
  kind: ArtifactKind
  lastModified: number
  name: string
  size?: number
}
const listCollections = async (ctx: MutationCtx | QueryCtx, userId: string) =>
  ctx.db
    .query('collections')
    .withIndex('by_user', q => q.eq('userId', userId))
    .order('desc')
    .take(100)
const listTemplates = async (ctx: MutationCtx | QueryCtx, userId: string) =>
  ctx.db
    .query('userTemplates')
    .withIndex('by_user', q => q.eq('userId', userId))
    .order('desc')
    .take(100)
const listReminders = async (ctx: MutationCtx | QueryCtx, userId: string) =>
  ctx.db
    .query('reminders')
    .withIndex('by_user', q => q.eq('userId', userId))
    .order('desc')
    .take(100)
const listMonitors = async (ctx: MutationCtx | QueryCtx, userId: string) =>
  ctx.db
    .query('monitors')
    .withIndex('by_user', q => q.eq('userId', userId))
    .order('desc')
    .take(100)
const listCorridors = async (ctx: MutationCtx | QueryCtx, userId: string) =>
  ctx.db
    .query('corridors')
    .withIndex('by_user', q => q.eq('userId', userId))
    .order('desc')
    .take(50)
const listKnowledge = async (ctx: MutationCtx | QueryCtx, userId: string) =>
  ctx.db
    .query('userKnowledgeBase')
    .withIndex('by_user', q => q.eq('userId', userId))
    .order('desc')
    .take(100)
const listProducts = async (ctx: MutationCtx | QueryCtx, userId: string) =>
  ctx.db
    .query('userProducts')
    .withIndex('by_user', q => q.eq('userId', userId))
    .order('desc')
    .take(100)
const listBookmarks = async (ctx: MutationCtx | QueryCtx, userId: string) =>
  ctx.db
    .query('bookmarks')
    .withIndex('by_user', q => q.eq('userId', userId))
    .order('desc')
    .take(100)
const aggregateOwn = async (ctx: MutationCtx | QueryCtx, userId: string): Promise<ArtifactSummary[]> => {
  const [collections, templates, reminders, monitors, corridors, knowledge, products, bookmarks] = await Promise.all([
    listCollections(ctx, userId),
    listTemplates(ctx, userId),
    listReminders(ctx, userId),
    listMonitors(ctx, userId),
    listCorridors(ctx, userId),
    listKnowledge(ctx, userId),
    listProducts(ctx, userId),
    listBookmarks(ctx, userId)
  ])
  const out: ArtifactSummary[] = []
  for (const c of collections)
    if (!c.deletedAt)
      out.push({ id: c._id, kind: 'collection', lastModified: c.updatedAt, name: c.name, size: c.totalCompanies })
  for (const t of templates) out.push({ id: t._id, kind: 'template', lastModified: t.updatedAt, name: t.name })
  for (const r of reminders) out.push({ id: r._id, kind: 'reminder', lastModified: r.updatedAt, name: r.name })
  for (const m of monitors) out.push({ id: m._id, kind: 'monitor', lastModified: m.updatedAt, name: m.name })
  for (const co of corridors) out.push({ id: co._id, kind: 'corridor', lastModified: co.updatedAt, name: co.name })
  for (const k of knowledge) out.push({ id: k._id, kind: 'knowledge', lastModified: k.updatedAt, name: k.filename })
  for (const p of products) out.push({ id: p._id, kind: 'product', lastModified: p.updatedAt, name: p.name })
  for (const b of bookmarks) out.push({ id: b._id, kind: 'bookmark', lastModified: b.addedAt, name: b.refId })
  return out.toSorted((a, b) => b.lastModified - a.lastModified)
}
const listAll = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }): Promise<ArtifactSummary[]> => aggregateOwn(ctx, userId)
})
interface Resolver {
  kind: ArtifactKind
  load: (ctx: MutationCtx | QueryCtx, userId: string) => Promise<ArtifactSummary | null>
}
const findOne = <T>(
  rows: T[],
  predicate: (row: T) => boolean,
  build: (row: T) => ArtifactSummary
): ArtifactSummary | null => {
  const hit = rows.find(predicate)
  return hit ? build(hit) : null
}
const buildResolvers = (want: string): Resolver[] => {
  const match = (n: string): boolean => n.toLowerCase().trim() === want
  return [
    {
      kind: 'collection',
      load: async (ctx, userId) =>
        findOne(
          await listCollections(ctx, userId),
          c => !c.deletedAt && match(c.name),
          c => ({ id: c._id, kind: 'collection', lastModified: c.updatedAt, name: c.name, size: c.totalCompanies })
        )
    },
    {
      kind: 'template',
      load: async (ctx, userId) =>
        findOne(
          await listTemplates(ctx, userId),
          t => match(t.name),
          t => ({ id: t._id, kind: 'template', lastModified: t.updatedAt, name: t.name })
        )
    },
    {
      kind: 'reminder',
      load: async (ctx, userId) =>
        findOne(
          await listReminders(ctx, userId),
          r => match(r.name),
          r => ({ id: r._id, kind: 'reminder', lastModified: r.updatedAt, name: r.name })
        )
    },
    {
      kind: 'monitor',
      load: async (ctx, userId) =>
        findOne(
          await listMonitors(ctx, userId),
          m => match(m.name),
          m => ({ id: m._id, kind: 'monitor', lastModified: m.updatedAt, name: m.name })
        )
    },
    {
      kind: 'knowledge',
      load: async (ctx, userId) =>
        findOne(
          await listKnowledge(ctx, userId),
          k => match(k.filename),
          k => ({ id: k._id, kind: 'knowledge', lastModified: k.updatedAt, name: k.filename })
        )
    },
    {
      kind: 'product',
      load: async (ctx, userId) =>
        findOne(
          await listProducts(ctx, userId),
          p => match(p.name),
          p => ({ id: p._id, kind: 'product', lastModified: p.updatedAt, name: p.name })
        )
    },
    {
      kind: 'bookmark',
      load: async (ctx, userId) =>
        findOne(
          await listBookmarks(ctx, userId),
          b => match(b.refId),
          b => ({ id: b._id, kind: 'bookmark', lastModified: b.addedAt, name: b.refId })
        )
    },
    {
      kind: 'corridor',
      load: async (ctx, userId) =>
        findOne(
          await listCorridors(ctx, userId),
          co => match(co.name),
          co => ({ id: co._id, kind: 'corridor', lastModified: co.updatedAt, name: co.name })
        )
    }
  ]
}
const resolveByName = internalQuery({
  args: { kind: v.optional(ARTIFACT_KIND), name: v.string(), userId: v.string() },
  handler: async (ctx, { kind, name, userId }): Promise<ArtifactSummary | null> => {
    const want = name.toLowerCase().trim()
    for (const r of buildResolvers(want)) {
      if (kind && r.kind !== kind) continue
      const hit = await r.load(ctx, userId)
      if (hit) return hit
    }
    return null
  }
})
const autocomplete = internalQuery({
  args: { prefix: v.string(), userId: v.string() },
  handler: async (ctx, { prefix, userId }): Promise<ArtifactSummary[]> => {
    const all = await aggregateOwn(ctx, userId)
    const want = prefix.toLowerCase().trim()
    return all.filter(a => a.name.toLowerCase().startsWith(want)).slice(0, 10)
  }
})
const listMine = query({
  args: {},
  handler: async (ctx): Promise<ArtifactSummary[]> => {
    const userId = await getOwnerEmailOrNull(ctx)
    if (!userId) return []
    return aggregateOwn(ctx, userId)
  }
})
export { autocomplete, listAll, listMine, resolveByName }
export type { ArtifactKind, ArtifactSummary }
