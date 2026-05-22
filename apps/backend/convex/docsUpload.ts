/* eslint-disable no-await-in-loop */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential Convex DB ops */
/** biome-ignore-all lint/style/noProcessEnv: clamav host env */
/** biome-ignore-all lint/nursery/noUndeclaredEnvVars: CLAMAV_HOST optional */
/** biome-ignore-all lint/suspicious/useAwait: scanBytes wraps net.Socket callback in Promise */
'use node'
import { v } from 'convex/values'
import { Buffer } from 'node:buffer'
import { connect } from 'node:net'
import type { Id } from './_generated/dataModel'
import { internal } from './_generated/api'
import { internalAction } from './_generated/server'
import { canonicalizeEmail } from './authHelpers'

const ALLOWED_MIMES = new Set<string>([
  'application/epub+zip',
  'application/pdf',
  'application/rtf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/tiff',
  'image/webp',
  'text/markdown',
  'text/plain'
])
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
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}
interface UploadResult {
  docId?: Id<'docs'>
  duplicate?: { existingId: Id<'docs'>; filename: string; uploadedAt: number }
  filenameConflict?: { existingId: Id<'docs'>; filename: string }
  ok: boolean
  reason?: string
  signature?: string
}
const SUFFIX_RE = /^(?<stem>.+?)(?:\.(?<ext>[^.]+))?$/u
interface KeepBothOpts {
  base: string
  findByFilename: (filename: string) => Promise<unknown>
  owner: string | undefined
  scope: 'mine' | 'shared'
}
const buildKeepBothFilename = async (opts: KeepBothOpts): Promise<string> => {
  const { base, findByFilename } = opts
  const m = SUFFIX_RE.exec(base)
  const stem = m?.groups?.stem ?? base
  const ext = m?.groups?.ext ? `.${m.groups.ext}` : ''
  for (let n = 2; n <= 99; n += 1) {
    const cand = `${stem} (${n})${ext}`
    const hit = await findByFilename(cand)
    if (!hit) return cand
  }
  throw new Error('keep-both suffix exhausted')
}
const finalize = internalAction({
  args: {
    filename: v.string(),
    keepBoth: v.optional(v.boolean()),
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
    const recentQuarantines = await ctx.runQuery(internal.docs.countRecentQuarantines, {
      sha256,
      sinceMs: 60 * 60 * 1000,
      uploadedBy
    })
    if (recentQuarantines >= 3) {
      await ctx.storage.delete(args.storageId)
      throw new Error('too many rejected uploads')
    }
    const earlyScan: ScanResult = await scanBytes(bytes).catch(
      (error: unknown) => ({ ok: false, signature: `clamav-error:${String(error)}` }) satisfies ScanResult
    )
    if (!earlyScan.ok) {
      const idRaw = await ctx.runMutation(internal.docs.insertQuarantined, {
        fileSize: bytes.byteLength,
        filename: args.filename,
        mime: args.mime,
        owner,
        scope: args.scope,
        sha256,
        signature: earlyScan.signature ?? 'unknown',
        storageId: args.storageId,
        uploadedBy
      })
      return { docId: idRaw, ok: false, reason: 'quarantined', signature: earlyScan.signature }
    }
    if (!ALLOWED_MIMES.has(args.mime)) {
      await ctx.storage.delete(args.storageId)
      return { ok: false, reason: `unsupported-mime:${args.mime}` }
    }
    const dupRaw = await ctx.runQuery(internal.docs.findBySha256, {
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
    let effectiveFilename = args.filename
    const conflictRaw = await ctx.runQuery(internal.docs.findByFilename, {
      filename: args.filename,
      owner,
      scope: args.scope
    })
    let conflict = conflictRaw
    if (conflict && args.keepBoth) {
      effectiveFilename = await buildKeepBothFilename({
        base: args.filename,
        findByFilename: async fn => ctx.runQuery(internal.docs.findByFilename, { filename: fn, owner, scope: args.scope }),
        owner,
        scope: args.scope
      })
      conflict = null
    }
    if (conflict && !args.replace) {
      await ctx.storage.delete(args.storageId)
      return {
        filenameConflict: { existingId: conflict._id, filename: conflict.filename },
        ok: false,
        reason: 'filename-conflict'
      }
    }
    const version = conflict ? (conflict.version ?? 1) + 1 : 1
    const docIdRaw = await ctx.runMutation(internal.docs.insertRow, {
      fileSize: bytes.byteLength,
      filename: effectiveFilename,
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
