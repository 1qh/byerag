/** biome-ignore-all lint/performance/noAwaitInLoops: sequential write */
/* eslint-disable no-await-in-loop */
'use node'
import { v } from 'convex/values'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Id } from './_generated/dataModel'
import { internal } from './_generated/api'
import { internalAction } from './_generated/server'

const WORKSPACES_ROOT = '/workspaces'
const SAFE_OWNER_RE = /[^a-z0-9_.-]/giu
const SAFE_FILE_RE = /[^a-z0-9._\- ()]/giu
const slugOwner = (s: string): string => s.toLowerCase().replaceAll(SAFE_OWNER_RE, '_').slice(0, 64)
const slugFile = (s: string): string => s.replaceAll(SAFE_FILE_RE, '_').slice(0, 200)
interface DocBlob {
  filename: string
  storageId: Id<'_storage'>
}
const materializeOwner = internalAction({
  args: { owner: v.string() },
  handler: async (ctx, { owner }): Promise<{ mineCount: number; sharedCount: number }> => {
    const ownerSlug = slugOwner(owner)
    const mineDir = join(WORKSPACES_ROOT, 'mine', ownerSlug)
    const sharedDir = join(WORKSPACES_ROOT, 'shared')
    await rm(mineDir, { force: true, recursive: true }).catch(() => undefined)
    await mkdir(mineDir, { recursive: true })
    await mkdir(sharedDir, { recursive: true })
    const mineDocs = (await ctx.runQuery(internal.docs.listMineForSandbox, { owner })) as DocBlob[]
    const sharedDocs = (await ctx.runQuery(internal.docs.listSharedForSandbox, {})) as DocBlob[]
    const write = async (rootDir: string, doc: DocBlob): Promise<boolean> => {
      const blob = await ctx.storage.get(doc.storageId)
      if (!blob) return false
      const bytes = new Uint8Array(await blob.arrayBuffer())
      const target = join(rootDir, slugFile(doc.filename))
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, bytes)
      return true
    }
    let mineCount = 0
    let sharedCount = 0
    for (const d of mineDocs) if (await write(mineDir, d)) mineCount += 1
    for (const d of sharedDocs) if (await write(sharedDir, d)) sharedCount += 1
    return { mineCount, sharedCount }
  }
})
export { materializeOwner }
