import { v } from 'convex/values'
import type { Id } from './_generated/dataModel'
import { internalQuery, mutation, query } from './_generated/server'
import { getOwnerEmailOrNull, requireOwnerEmail } from './authHelpers'

const getUrl = internalQuery({
  args: { storageId: v.id('_storage') },
  handler: async (ctx, { storageId }: { storageId: Id<'_storage'> }) => ctx.storage.getUrl(storageId)
})
const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx): Promise<string> => {
    await requireOwnerEmail(ctx)
    return ctx.storage.generateUploadUrl()
  }
})
const url = query({
  args: { storageId: v.id('_storage') },
  handler: async (ctx, { storageId }): Promise<null | string> => {
    const owner = await getOwnerEmailOrNull(ctx)
    if (!owner) return null
    return ctx.storage.getUrl(storageId)
  }
})
export { generateUploadUrl, getUrl, url }
