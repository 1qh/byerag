import type { GenericActionCtx } from 'convex/server'
import { v } from 'convex/values'
import type { DataModel } from './_generated/dataModel'
import { internal } from './_generated/api'
import { action } from './_generated/server'
type Ctx = GenericActionCtx<DataModel>
interface FileEntry {
  name: string
  size?: number
  type: string
}
const FILE_OPS_RATE_MAX = 120
const FILE_UPLOAD_RATE_MAX = 30
const FILE_ZIP_RATE_MAX = 10
const requireEmail = async (ctx: Ctx): Promise<string> => {
  const email: null | string = await ctx.runQuery(internal.chats.getAuthEmail)
  if (!email) throw new Error('not authenticated')
  return email
}
const rate = async (opts: { ctx: Ctx; email: string; max: number; op: string }): Promise<void> => {
  const { ctx, email, op, max } = opts
  const ok: boolean = await ctx.runMutation(internal.lib.checkRateLimit, { max, owner: `file-${op}:${email}` })
  if (!ok) throw new Error('rate limited')
}
const list = action({
  args: { path: v.string() },
  handler: async (ctx, { path }): Promise<FileEntry[]> => {
    const email = await requireEmail(ctx)
    await rate({ ctx, email, max: FILE_OPS_RATE_MAX, op: 'list' })
    return ctx.runAction(internal.files.list, { email, path })
  }
})
const read = action({
  args: { path: v.string() },
  handler: async (ctx, { path }): Promise<{ binary: boolean; content: string; size: number; truncated: boolean }> => {
    const email = await requireEmail(ctx)
    await rate({ ctx, email, max: FILE_OPS_RATE_MAX, op: 'read' })
    return ctx.runAction(internal.files.read, { email, path })
  }
})
const upload = action({
  args: { binary: v.optional(v.boolean()), content: v.string(), path: v.string() },
  handler: async (ctx, { path, content, binary }): Promise<void> => {
    const email = await requireEmail(ctx)
    await rate({ ctx, email, max: FILE_UPLOAD_RATE_MAX, op: 'upload' })
    await ctx.runAction(internal.files.write, { binary, content, email, path })
  }
})
const makeDir = action({
  args: { path: v.string() },
  handler: async (ctx, { path }): Promise<void> => {
    const email = await requireEmail(ctx)
    await rate({ ctx, email, max: FILE_OPS_RATE_MAX, op: 'mkdir' })
    await ctx.runAction(internal.files.makeDir, { email, path })
  }
})
const remove = action({
  args: { path: v.string() },
  handler: async (ctx, { path }): Promise<void> => {
    const email = await requireEmail(ctx)
    await rate({ ctx, email, max: FILE_OPS_RATE_MAX, op: 'remove' })
    await ctx.runAction(internal.files.remove, { email, path })
  }
})
const downloadZip = action({
  args: { path: v.string() },
  handler: async (ctx, { path }): Promise<{ base64: string; size: number }> => {
    const email = await requireEmail(ctx)
    await rate({ ctx, email, max: FILE_ZIP_RATE_MAX, op: 'zip' })
    return ctx.runAction(internal.files.downloadZip, { email, path })
  }
})
export { downloadZip, list, makeDir, read, remove, upload }
