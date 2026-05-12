/** biome-ignore-all lint/suspicious/useAwait: Convex .first() helpers must be wrapped to defeat biome autofix */
import { v } from 'convex/values'
import type { QueryCtx } from '../../_generated/server'
import { internalQuery } from '../../_generated/server'
const MENTION_RE = /^@(?<kind>[a-z]+):(?<name>[a-zA-Z0-9_.-]+)$/u
const findCompanyByName = async (ctx: QueryCtx, name: string) =>
  ctx.db
    .query('companies')
    .filter(q => q.eq(q.field('name'), name))
    .first()
const findCollectionByName = async (ctx: QueryCtx, userId: string, name: string) =>
  ctx.db
    .query('collections')
    .withIndex('by_user_name', q => q.eq('userId', userId).eq('name', name))
    .first()
const findCorridorByName = async (ctx: QueryCtx, userId: string, name: string) =>
  ctx.db
    .query('corridors')
    .withIndex('by_user_name', q => q.eq('userId', userId).eq('name', name))
    .first()
const findTemplateByName = async (ctx: QueryCtx, userId: string, name: string) =>
  ctx.db
    .query('userTemplates')
    .withIndex('by_user_name', q => q.eq('userId', userId).eq('name', name))
    .first()
const findKbByFilename = async (ctx: QueryCtx, userId: string, name: string) =>
  ctx.db
    .query('userKnowledgeBase')
    .filter(q => q.and(q.eq(q.field('userId'), userId), q.eq(q.field('filename'), name)))
    .first()
const findProductByName = async (ctx: QueryCtx, userId: string, name: string) =>
  ctx.db
    .query('userProducts')
    .filter(q => q.and(q.eq(q.field('userId'), userId), q.eq(q.field('name'), name)))
    .first()
interface LookupOpts {
  ctx: QueryCtx
  kind: string
  name: string
  userId: string
}
const lookupByKind = async ({ ctx, kind, userId, name }: LookupOpts): Promise<null | { _id: string }> => {
  if (kind === 'company') {
    const r = await findCompanyByName(ctx, name)
    return r ? { _id: r._id } : null
  }
  if (kind === 'collection') {
    const r = await findCollectionByName(ctx, userId, name)
    return r ? { _id: r._id } : null
  }
  if (kind === 'corridor') {
    const r = await findCorridorByName(ctx, userId, name)
    return r ? { _id: r._id } : null
  }
  if (kind === 'template') {
    const r = await findTemplateByName(ctx, userId, name)
    return r ? { _id: r._id } : null
  }
  if (kind === 'knowledge') {
    const r = await findKbByFilename(ctx, userId, name)
    return r ? { _id: r._id } : null
  }
  if (kind === 'product') {
    const r = await findProductByName(ctx, userId, name)
    return r ? { _id: r._id } : null
  }
  return null
}
const resolveMention = internalQuery({
  args: { mention: v.string(), userId: v.string() },
  handler: async (ctx, { mention, userId }) => {
    const match = MENTION_RE.exec(mention)
    if (!match?.groups) return null
    const kind = match.groups.kind ?? ''
    const name = match.groups.name ?? ''
    const row = await lookupByKind({ ctx, kind, name, userId })
    return row ? { _id: row._id, kind, name } : { _id: null, kind, name }
  }
})
export { MENTION_RE, resolveMention }
