/** biome-ignore-all lint/nursery/useNamedCaptureGroup: simple capture index */
/* eslint-disable prefer-named-capture-group */
import { v } from 'convex/values'
import type { Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { internalMutation, internalQuery } from './_generated/server'
const businessType = v.union(v.literal('export'), v.literal('import'))
const VARIABLE_RE = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/gu
const FILE_ID_RE = /\[FILE_ID:([^\]:]+):[^\]]+\]/gu
const extractVariables = (content: string): string[] => {
  const out = new Set<string>()
  for (const m of content.matchAll(VARIABLE_RE)) if (m[1]) out.add(m[1])
  return [...out]
}
const extractAttachmentIds = (content: string): Id<'_storage'>[] => {
  const out = new Set<Id<'_storage'>>()
  for (const m of content.matchAll(FILE_ID_RE)) if (m[1]) out.add(m[1] as Id<'_storage'>)
  return [...out]
}
const findTemplateByName = async (ctx: MutationCtx | QueryCtx, userId: string, name: string) =>
  ctx.db
    .query('userTemplates')
    .withIndex('by_user_name', q => q.eq('userId', userId).eq('name', name))
    .first()
const upsertTemplate = internalMutation({
  args: {
    businessType: v.optional(businessType),
    category: v.optional(v.string()),
    content: v.string(),
    name: v.string(),
    subject: v.string(),
    userId: v.string()
  },
  handler: async (ctx, args): Promise<Id<'userTemplates'>> => {
    const now = Date.now()
    const variables = extractVariables(args.content)
    const attachmentIds = extractAttachmentIds(args.content)
    const existing = await findTemplateByName(ctx, args.userId, args.name)
    if (existing) {
      await ctx.db.patch(existing._id, {
        attachmentIds,
        businessType: args.businessType ?? existing.businessType,
        category: args.category ?? existing.category,
        content: args.content,
        subject: args.subject,
        updatedAt: now,
        variables
      })
      return existing._id
    }
    return ctx.db.insert('userTemplates', {
      attachmentIds,
      businessType: args.businessType ?? 'export',
      category: args.category,
      content: args.content,
      name: args.name,
      subject: args.subject,
      updatedAt: now,
      userId: args.userId,
      variables
    })
  }
})
const deleteTemplate = internalMutation({
  args: { name: v.string(), userId: v.string() },
  handler: async (ctx, { name, userId }): Promise<boolean> => {
    const existing = await findTemplateByName(ctx, userId, name)
    if (!existing) return false
    await ctx.db.delete(existing._id)
    return true
  }
})
const listTemplates = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) =>
    ctx.db
      .query('userTemplates')
      .withIndex('by_user', q => q.eq('userId', userId))
      .order('desc')
      .take(100)
})
const getTemplateByName = internalQuery({
  args: { name: v.string(), userId: v.string() },
  handler: async (ctx, { name, userId }) => findTemplateByName(ctx, userId, name)
})
const insertReminder = internalMutation({
  args: { description: v.string(), fireAt: v.number(), name: v.string(), userId: v.string() },
  handler: async (ctx, args): Promise<Id<'reminders'>> =>
    ctx.db.insert('reminders', {
      description: args.description,
      fireAt: args.fireAt,
      fired: false,
      name: args.name,
      updatedAt: Date.now(),
      userId: args.userId
    })
})
const findReminderByName = async (ctx: MutationCtx | QueryCtx, userId: string, name: string) =>
  ctx.db
    .query('reminders')
    .withIndex('by_user', q => q.eq('userId', userId))
    .filter(q => q.eq(q.field('name'), name))
    .first()
const cancelReminder = internalMutation({
  args: { name: v.string(), userId: v.string() },
  handler: async (ctx, { name, userId }): Promise<boolean> => {
    const existing = await findReminderByName(ctx, userId, name)
    if (!existing) return false
    await ctx.db.delete(existing._id)
    return true
  }
})
const listReminders = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) =>
    ctx.db
      .query('reminders')
      .withIndex('by_user_fired', q => q.eq('userId', userId).eq('fired', false))
      .order('asc')
      .take(50)
})
const insertMonitor = internalMutation({
  args: {
    description: v.string(),
    name: v.string(),
    schedule: v.string(),
    signal: v.union(
      v.literal('reply-arrived'),
      v.literal('non-responder-followup'),
      v.literal('new-company-matching-criteria'),
      v.literal('tariff-change'),
      v.literal('dead-domain')
    ),
    target: v.string(),
    userId: v.string()
  },
  handler: async (ctx, args): Promise<Id<'monitors'>> =>
    ctx.db.insert('monitors', {
      description: args.description,
      enabled: true,
      name: args.name,
      schedule: args.schedule,
      signal: args.signal,
      target: args.target,
      updatedAt: Date.now(),
      userId: args.userId
    })
})
const findMonitorByName = async (ctx: MutationCtx | QueryCtx, userId: string, name: string) =>
  ctx.db
    .query('monitors')
    .withIndex('by_user', q => q.eq('userId', userId))
    .filter(q => q.eq(q.field('name'), name))
    .first()
const cancelMonitor = internalMutation({
  args: { name: v.string(), userId: v.string() },
  handler: async (ctx, { name, userId }): Promise<boolean> => {
    const existing = await findMonitorByName(ctx, userId, name)
    if (!existing) return false
    await ctx.db.patch(existing._id, { enabled: false })
    return true
  }
})
const listMonitors = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) =>
    ctx.db
      .query('monitors')
      .withIndex('by_user_enabled', q => q.eq('userId', userId).eq('enabled', true))
      .order('desc')
      .take(50)
})
const insertKbEntry = internalMutation({
  args: {
    businessType: v.optional(businessType),
    content: v.optional(v.string()),
    fileId: v.id('_storage'),
    fileSize: v.optional(v.number()),
    fileType: v.optional(v.string()),
    filename: v.string(),
    metadata: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    userId: v.string()
  },
  handler: async (ctx, args): Promise<Id<'userKnowledgeBase'>> =>
    ctx.db.insert('userKnowledgeBase', {
      businessType: args.businessType ?? 'export',
      content: args.content,
      fileId: args.fileId,
      fileSize: args.fileSize,
      fileType: args.fileType,
      filename: args.filename,
      metadata: args.metadata,
      tags: args.tags ?? [],
      updatedAt: Date.now(),
      userId: args.userId
    })
})
const deleteKbEntry = internalMutation({
  args: { id: v.id('userKnowledgeBase'), userId: v.string() },
  handler: async (ctx, { id, userId }): Promise<boolean> => {
    const existing = await ctx.db.get(id)
    if (existing?.userId !== userId) return false
    await ctx.db.delete(id)
    return true
  }
})
const listKb = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) =>
    ctx.db
      .query('userKnowledgeBase')
      .withIndex('by_user', q => q.eq('userId', userId))
      .order('desc')
      .take(100)
})
const findProductByName = async (ctx: MutationCtx | QueryCtx, userId: string, name: string) =>
  ctx.db
    .query('userProducts')
    .withIndex('by_user', q => q.eq('userId', userId))
    .filter(q => q.eq(q.field('name'), name))
    .first()
const upsertProduct = internalMutation({
  args: {
    businessType: v.optional(businessType),
    category: v.optional(v.string()),
    description: v.optional(v.string()),
    hsCode: v.optional(v.string()),
    imageId: v.optional(v.id('_storage')),
    moq: v.optional(v.string()),
    name: v.string(),
    userId: v.string()
  },
  handler: async (ctx, args): Promise<Id<'userProducts'>> => {
    const now = Date.now()
    const existing = await findProductByName(ctx, args.userId, args.name)
    if (existing) {
      await ctx.db.patch(existing._id, {
        businessType: args.businessType ?? existing.businessType,
        category: args.category ?? existing.category,
        description: args.description ?? existing.description,
        hsCode: args.hsCode ?? existing.hsCode,
        imageId: args.imageId ?? existing.imageId,
        moq: args.moq ?? existing.moq,
        updatedAt: now
      })
      return existing._id
    }
    return ctx.db.insert('userProducts', {
      businessType: args.businessType ?? 'export',
      category: args.category,
      description: args.description,
      hsCode: args.hsCode,
      imageId: args.imageId,
      moq: args.moq,
      name: args.name,
      updatedAt: now,
      userId: args.userId
    })
  }
})
const deleteProduct = internalMutation({
  args: { name: v.string(), userId: v.string() },
  handler: async (ctx, { name, userId }): Promise<boolean> => {
    const existing = await findProductByName(ctx, userId, name)
    if (!existing) return false
    await ctx.db.delete(existing._id)
    return true
  }
})
const listProducts = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) =>
    ctx.db
      .query('userProducts')
      .withIndex('by_user', q => q.eq('userId', userId))
      .order('desc')
      .take(100)
})
const getProductByName = internalQuery({
  args: { name: v.string(), userId: v.string() },
  handler: async (ctx, { name, userId }) => findProductByName(ctx, userId, name)
})
const getKbByFilename = internalQuery({
  args: { filename: v.string(), userId: v.string() },
  handler: async (ctx, { filename, userId }) =>
    ctx.db
      .query('userKnowledgeBase')
      .withIndex('by_user', q => q.eq('userId', userId))
      .filter(q => q.eq(q.field('filename'), filename))
      .first()
})
const getReminderByName = internalQuery({
  args: { name: v.string(), userId: v.string() },
  handler: async (ctx, { name, userId }) =>
    ctx.db
      .query('reminders')
      .withIndex('by_user', q => q.eq('userId', userId))
      .filter(q => q.eq(q.field('name'), name))
      .first()
})
const getMonitorByName = internalQuery({
  args: { name: v.string(), userId: v.string() },
  handler: async (ctx, { name, userId }) =>
    ctx.db
      .query('monitors')
      .withIndex('by_user', q => q.eq('userId', userId))
      .filter(q => q.eq(q.field('name'), name))
      .first()
})
const generateUploadUrl = internalMutation({
  args: {},
  handler: async ctx => ctx.storage.generateUploadUrl()
})
export {
  cancelMonitor,
  cancelReminder,
  deleteKbEntry,
  deleteProduct,
  deleteTemplate,
  extractAttachmentIds,
  extractVariables,
  generateUploadUrl,
  getKbByFilename,
  getMonitorByName,
  getProductByName,
  getReminderByName,
  getTemplateByName,
  insertKbEntry,
  insertMonitor,
  insertReminder,
  listKb,
  listMonitors,
  listProducts,
  listReminders,
  listTemplates,
  upsertProduct,
  upsertTemplate
}
