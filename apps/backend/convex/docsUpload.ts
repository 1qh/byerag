/** biome-ignore-all lint/style/noProcessEnv: clamav host env */
/** biome-ignore-all lint/nursery/noUndeclaredEnvVars: CLAMAV_HOST optional */
/** biome-ignore-all lint/suspicious/useAwait: scanBytes wraps net.Socket callback in Promise */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
'use node'
import type { FunctionReference } from 'convex/server'
import { v } from 'convex/values'
import { Buffer } from 'node:buffer'
import { connect } from 'node:net'
import type { Id } from './_generated/dataModel'
import type { DocRow } from './docs'
import { internal } from './_generated/api'
import { internalAction } from './_generated/server'
import { canonicalizeEmail } from './authHelpers'
const CLAMAV_HOST = process.env.CLAMAV_HOST ?? 'clamav'
const CLAMAV_PORT = 3310
const CLAMAV_DEADLINE_MS = 30_000
const MAX_FILE_BYTES = 50 * 1024 * 1024
const FOUND_RE = /:\s*(?<sig>.+)\s+FOUND/u
const NUL_TRAILING_RE = new RegExp(`${String.fromCodePoint(0)}+$`, 'u')
interface ScanResult {
  ok: boolean
  signature?: string
}
const scanBytes = async (bytes: Uint8Array): Promise<ScanResult> => {
  if (bytes.byteLength > MAX_FILE_BYTES) return { ok: false, signature: `oversized:${bytes.byteLength}` }
  return new Promise<ScanResult>((resolve, reject) => {
    const sock = connect(CLAMAV_PORT, CLAMAV_HOST)
    const chunks: Buffer[] = []
    const timer = setTimeout(() => {
      sock.destroy()
      reject(new Error(`clamav timeout after ${CLAMAV_DEADLINE_MS}ms`))
    }, CLAMAV_DEADLINE_MS)
    const finish = (r: ScanResult): void => {
      clearTimeout(timer)
      sock.destroy()
      resolve(r)
    }
    sock.on('connect', () => {
      sock.write('zINSTREAM\0')
      const lenBuf = Buffer.alloc(4)
      lenBuf.writeUInt32BE(bytes.byteLength, 0)
      sock.write(lenBuf)
      sock.write(Buffer.from(bytes))
      sock.write(Buffer.alloc(4))
    })
    sock.on('data', (c: Buffer) => {
      chunks.push(c)
    })
    sock.on('end', () => {
      const reply = Buffer.concat(chunks).toString('utf8').replace(NUL_TRAILING_RE, '')
      if (reply.includes(' OK')) finish({ ok: true })
      else {
        const m = FOUND_RE.exec(reply)
        finish({ ok: false, signature: m?.groups?.sig ?? reply.slice(0, 200) })
      }
    })
    sock.on('error', (err: Error) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}
const sha256Hex = async (bytes: Uint8Array): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}
interface FindByFilenameArgs {
  filename: string
  owner?: string
  scope: 'mine' | 'shared'
}
type FindByFilenameRef = FunctionReference<'query', 'internal', FindByFilenameArgs, DocRow | null>
interface FindByShaArgs {
  owner?: string
  scope: 'mine' | 'shared'
  sha256: string
}
type FindByShaRef = FunctionReference<'query', 'internal', FindByShaArgs, DocRow | null>
interface InsertQuarantinedArgs {
  filename: string
  fileSize: number
  mime: string
  owner?: string
  scope: 'mine' | 'shared'
  sha256: string
  signature: string
  uploadedBy: string
}
type InsertQuarantinedRef = FunctionReference<'mutation', 'internal', InsertQuarantinedArgs, Id<'docs'>>
interface InsertRowArgs {
  filename: string
  fileSize: number
  mime: string
  owner?: string
  scope: 'mine' | 'shared'
  sha256: string
  storageId: Id<'_storage'>
  supersedes?: Id<'docs'>
  uploadedBy: string
  version: number
}
type InsertRowRef = FunctionReference<'mutation', 'internal', InsertRowArgs, Id<'docs'>>
interface UploadResult {
  docId?: Id<'docs'>
  duplicate?: { existingId: Id<'docs'>; filename: string; uploadedAt: number }
  filenameConflict?: { existingId: Id<'docs'>; filename: string }
  ok: boolean
  reason?: string
  signature?: string
}
const finalize = internalAction({
  args: {
    filename: v.string(),
    mime: v.string(),
    replace: v.optional(v.boolean()),
    scope: v.union(v.literal('shared'), v.literal('mine')),
    storageId: v.id('_storage'),
    uploaderEmail: v.string()
  },
  handler: async (ctx, args): Promise<UploadResult> => {
    const blob = await ctx.storage.get(args.storageId)
    if (!blob) return { ok: false, reason: 'blob-missing' }
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const uploadedBy = canonicalizeEmail(args.uploaderEmail)
    const owner = args.scope === 'mine' ? uploadedBy : undefined
    const sha256 = await sha256Hex(bytes)
    const dupRaw = await ctx.runQuery(internal.docs.findBySha256 as FindByShaRef, {
      owner,
      scope: args.scope,
      sha256
    })
    const dup = dupRaw
    if (dup) {
      await ctx.storage.delete(args.storageId)
      return {
        duplicate: { existingId: dup._id, filename: dup.filename, uploadedAt: dup.uploadedAt },
        ok: false,
        reason: 'duplicate'
      }
    }
    const conflictRaw = await ctx.runQuery(internal.docs.findByFilename as FindByFilenameRef, {
      filename: args.filename,
      owner,
      scope: args.scope
    })
    const conflict = conflictRaw
    if (conflict && !args.replace) {
      await ctx.storage.delete(args.storageId)
      return {
        filenameConflict: { existingId: conflict._id, filename: conflict.filename },
        ok: false,
        reason: 'filename-conflict'
      }
    }
    const scan: ScanResult = await scanBytes(bytes).catch(
      (error: unknown) => ({ ok: false, signature: `clamav-error:${String(error)}` }) satisfies ScanResult
    )
    if (!scan.ok) {
      await ctx.storage.delete(args.storageId)
      const idRaw = await ctx.runMutation(internal.docs.insertQuarantined as InsertQuarantinedRef, {
        fileSize: bytes.byteLength,
        filename: args.filename,
        mime: args.mime,
        owner,
        scope: args.scope,
        sha256,
        signature: scan.signature ?? 'unknown',
        uploadedBy
      })
      const id = idRaw
      return { docId: id, ok: false, reason: 'quarantined', signature: scan.signature }
    }
    const version = conflict ? (conflict.version ?? 1) + 1 : 1
    const docIdRaw = await ctx.runMutation(internal.docs.insertRow as InsertRowRef, {
      fileSize: bytes.byteLength,
      filename: args.filename,
      mime: args.mime,
      owner,
      scope: args.scope,
      sha256,
      storageId: args.storageId,
      supersedes: conflict?._id,
      uploadedBy,
      version
    })
    const docId = docIdRaw
    return { docId, ok: true }
  }
})
export { finalize }
