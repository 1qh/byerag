/** biome-ignore-all lint/suspicious/noControlCharactersInRegex: intentional security sanitization */
/* eslint-disable no-control-regex, @typescript-eslint/max-params */
/* oxlint-disable eslint(max-params), eslint(no-control-regex) */
'use node'
import type { GenericActionCtx } from 'convex/server'
import { v } from 'convex/values'
import type { DataModel } from './_generated/dataModel'
import type { CommandResult, EntryInfo, Sandbox } from './sandboxClient'
import { internal } from './_generated/api'
import { internalAction } from './_generated/server'
import {
  BINARY_EXTENSIONS,
  CLAUDE_SESSIONS_PATH,
  CLAUDE_TMP_PATH,
  DISALLOWED_CHATID_CHAR_RE,
  MAX_READ_SIZE_BINARY,
  MAX_READ_SIZE_TEXT,
  MAX_UPLOAD_SIZE,
  WORKSPACE_PATH
} from './constants'
import { connectSandbox } from './sandboxClient'
import { log } from './utils'
const MULTI_SLASH_RE = /\/+/gu
const TRAILING_SLASH_RE = /\/$/u
const INVALID_PATH_CHARS_RE = /[;|&`$(){}'"\\\u0000-\u001F\u007F]/u
type Ctx = GenericActionCtx<DataModel>
interface FileEntry {
  name: string
  size?: number
  type: string
}
const connectForOwner = async (ctx: Ctx, email: string): Promise<Sandbox> => {
  const doc = await ctx.runQuery(internal.sandboxes.getByOwner, { owner: email })
  if (!doc) throw new Error('no sandbox')
  return connectSandbox(doc.sandboxId)
}
const validatePath = (path: string): string => {
  const resolved = path.replaceAll(MULTI_SLASH_RE, '/').replace(TRAILING_SLASH_RE, '')
  if (resolved !== WORKSPACE_PATH && !resolved.startsWith(`${WORKSPACE_PATH}/`))
    throw new Error(`access denied: ${resolved} is outside allowed paths`)
  if (resolved.split('/').some(s => s === '..' || s === '.')) throw new Error('path traversal not allowed')
  if (INVALID_PATH_CHARS_RE.test(resolved)) throw new Error('invalid characters in path')
  return resolved
}
const withSandbox = async <T>(
  ctx: Ctx,
  email: string,
  path: string,
  fn: (sandbox: Sandbox, safePath: string) => Promise<T>
): Promise<T> => {
  const safePath = validatePath(path)
  const sandbox = await connectForOwner(ctx, email)
  const realpath: CommandResult = await sandbox.commands.run(`realpath '${safePath}' 2>/dev/null`, {
    timeoutMs: 5000
  })
  if (realpath.exitCode !== 0) throw new Error('path does not resolve')
  const resolved: string = realpath.stdout.trim()
  if (!resolved) throw new Error('path does not resolve')
  if (resolved.includes('\n')) throw new Error('invalid path: contains newline')
  if (INVALID_PATH_CHARS_RE.test(resolved)) throw new Error('resolved path contains invalid characters')
  if (resolved !== WORKSPACE_PATH && !resolved.startsWith(`${WORKSPACE_PATH}/`))
    throw new Error('access denied: path resolves outside workspace')
  return fn(sandbox, resolved)
}
const list = internalAction({
  args: { email: v.string(), path: v.string() },
  handler: async (ctx, { email, path }): Promise<FileEntry[]> =>
    withSandbox(ctx, email, path, async (sandbox, safePath) => {
      const entries: EntryInfo[] = await sandbox.files.list(safePath)
      return entries.map((e: EntryInfo) => {
        const fileType: string = e.type
        const entry: FileEntry = { name: e.name, type: fileType }
        if (fileType === 'file' && typeof e.size === 'number') entry.size = e.size
        return entry
      })
    })
})
const read = internalAction({
  args: { email: v.string(), path: v.string() },
  handler: async (ctx, { email, path }): Promise<{ binary: boolean; content: string; size: number; truncated: boolean }> =>
    withSandbox(ctx, email, path, async (sandbox, safePath) => {
      const ext = safePath.split('.').pop()?.toLowerCase() ?? ''
      if (BINARY_EXTENSIONS.has(ext)) {
        const bytes: Uint8Array = await sandbox.files.read(safePath, { format: 'bytes' })
        if (bytes.length > MAX_READ_SIZE_BINARY) return { binary: true, content: '', size: bytes.length, truncated: true }
        return { binary: true, content: Buffer.from(bytes).toString('base64'), size: bytes.length, truncated: false }
      }
      const content: string = await sandbox.files.read(safePath, { format: 'text' })
      if (content.length > MAX_READ_SIZE_TEXT)
        return { binary: false, content: content.slice(0, MAX_READ_SIZE_TEXT), size: content.length, truncated: true }
      return { binary: false, content, size: content.length, truncated: false }
    })
})
const write = internalAction({
  args: { binary: v.optional(v.boolean()), content: v.string(), email: v.string(), path: v.string() },
  handler: async (ctx, { email, path, content, binary }): Promise<void> => {
    const decoded = binary ? Buffer.from(content, 'base64') : null
    const sizeBytes = decoded ? decoded.byteLength : Buffer.byteLength(content, 'utf8')
    if (sizeBytes > MAX_UPLOAD_SIZE) throw new Error('file too large (max 10MB)')
    await withSandbox(ctx, email, path, async (sandbox, safePath) => {
      if (safePath === WORKSPACE_PATH) throw new Error('cannot write to workspace root')
      const parentDir = safePath.split('/').slice(0, -1).join('/')
      const combined: CommandResult = await sandbox.commands.run(
        `mkdir -p '${parentDir}' && df -Pk /home/user | tail -1 | awk '{print $4 * 1024}'`,
        { timeoutMs: 5000 }
      )
      const availBytes = Number.parseInt(combined.stdout.trim(), 10)
      if (!Number.isFinite(availBytes)) throw new Error('sandbox disk check failed')
      if (availBytes < 100 * 1024 * 1024) throw new Error('sandbox disk nearly full')
      await sandbox.files.write(safePath, decoded ? new Uint8Array(decoded).buffer : content)
    })
  }
})
const makeDir = internalAction({
  args: { email: v.string(), path: v.string() },
  handler: async (ctx, { email, path }): Promise<void> => {
    await withSandbox(ctx, email, path, async (sandbox, safePath) => {
      await sandbox.commands.run(`mkdir -p '${safePath}'`, { timeoutMs: 5000 })
    })
  }
})
const remove = internalAction({
  args: { email: v.string(), path: v.string() },
  handler: async (ctx, { email, path }): Promise<void> =>
    withSandbox(ctx, email, path, async (sandbox, safePath) => {
      if (safePath === WORKSPACE_PATH) throw new Error('cannot delete workspace root')
      await sandbox.commands.run(`rm -rf '${safePath}'`, { timeoutMs: 10_000 })
    })
})
const downloadZip = internalAction({
  args: { email: v.string(), path: v.string() },
  handler: async (ctx, { email, path }): Promise<{ base64: string; size: number }> =>
    withSandbox(ctx, email, path, async (sandbox, safePath) => {
      const zipPath = `/tmp/download-${crypto.randomUUID()}.tar.gz`
      const cleanup = async (): Promise<void> => {
        try {
          await sandbox.commands.run(`rm -f '${zipPath}'`, { timeoutMs: 5000 })
        } catch {
          /* Best-effort — sandbox may be dying */
        }
      }
      try {
        const result: CommandResult = await sandbox.commands.run(
          `find '${safePath}' -mount -type l -prune -o -type f -print0 | tar czf '${zipPath}' --null -T - --transform 's|^${safePath}/||' 2>&1`,
          { timeoutMs: 30_000 }
        )
        if (result.exitCode !== 0) throw new Error(`tar failed: ${result.stderr || result.stdout}`)
        const sizeCheck: CommandResult = await sandbox.commands.run(
          `stat -c%s '${zipPath}' 2>/dev/null || stat -f%z '${zipPath}'`,
          { timeoutMs: 5000 }
        )
        const archiveSize = Number.parseInt(sizeCheck.stdout.trim(), 10)
        if (archiveSize > 1 * 1024 * 1024)
          throw new Error('archive too large (max 1MB; use file-by-file download for larger trees)')
        const zipContent: Uint8Array = await sandbox.files.read(zipPath, { format: 'bytes' })
        return { base64: Buffer.from(zipContent).toString('base64'), size: zipContent.length }
      } finally {
        await cleanup()
      }
    })
})
const cleanupChatDirs = internalAction({
  args: { chatId: v.id('chats'), email: v.string() },
  handler: async (ctx, { email, chatId }) => {
    if (DISALLOWED_CHATID_CHAR_RE.test(chatId)) {
      log('warn', 'cleanupChatDirs.skip', { chatId, reason: 'invalid chatId pattern' })
      return
    }
    try {
      const sandbox = await connectForOwner(ctx, email)
      await sandbox.commands.run(`rm -rf '${CLAUDE_SESSIONS_PATH}/${chatId}' '${CLAUDE_TMP_PATH}/${chatId}'`, {
        timeoutMs: 10_000
      })
    } catch (error) {
      log('warn', 'cleanupChatDirs.error', {
        chatId,
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }
})
export { cleanupChatDirs, downloadZip, list, makeDir, read, remove, write }
