/** biome-ignore-all lint/suspicious/useAwait: handler signature required by Convex */
import { errorRes, jsonRes } from '@a/cli'
import { v } from 'convex/values'
import type { Doc, Id } from '../../_generated/dataModel'
import type { ActionCtx, MutationCtx, QueryCtx } from '../../_generated/server'
import type { ResolvedAuth } from './auth'
import { internal } from '../../_generated/api'
import { httpAction, internalMutation, internalQuery, mutation, query } from '../../_generated/server'
import { hashSecret } from '../../secretHash'
const DEVICE_CODE_TTL_MS = 10 * 60 * 1000
const POLL_INTERVAL_MS = 5000
const findCliTokenByHash = async (ctx: MutationCtx | QueryCtx, tokenHash: string): Promise<Doc<'cliTokens'> | null> =>
  ctx.db
    .query('cliTokens')
    .withIndex('by_hash', q => q.eq('tokenHash', tokenHash))
    .first()
const findDeviceCodeByDeviceCode = async (ctx: MutationCtx, deviceCode: string): Promise<Doc<'cliDeviceCodes'> | null> =>
  ctx.db
    .query('cliDeviceCodes')
    .withIndex('by_deviceCode', q => q.eq('deviceCode', deviceCode))
    .first()
const findDeviceCodeByUserCode = async (ctx: MutationCtx, userCode: string): Promise<Doc<'cliDeviceCodes'> | null> =>
  ctx.db
    .query('cliDeviceCodes')
    .withIndex('by_userCode', q => q.eq('userCode', userCode))
    .first()
const cliTokenLookup = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, { tokenHash }) => {
    const row = await findCliTokenByHash(ctx, tokenHash)
    if (!row || row.revokedAt) return null
    return { _id: row._id, label: row.label, source: row.source, userId: row.userId }
  }
})
const cliTokenTouch = internalMutation({
  args: { tokenId: v.id('cliTokens') },
  handler: async (ctx, { tokenId }) => {
    await ctx.db.patch(tokenId, { lastUsedAt: Date.now() })
  }
})
const cliTokenAuth = async (ctx: ActionCtx, req: Request): Promise<null | ResolvedAuth> => {
  const authHeader = req.headers.get('Authorization') ?? ''
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!bearer || bearer.startsWith('dev-')) return null
  const tokenHash = await hashSecret(bearer)
  const row = await ctx.runQuery(internal.tools._app.cliAuth.cliTokenLookup, { tokenHash })
  if (!row) return null
  await ctx.runMutation(internal.tools._app.cliAuth.cliTokenTouch, { tokenId: row._id })
  return { mode: 'token', owner: row.userId, tier: 'user' }
}
const randomUserCode = (): string => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const pick = (n: number): string => {
    const out: string[] = []
    for (let i = 0; i < n; i += 1) out.push(alphabet[Math.floor(Math.random() * alphabet.length)] ?? 'A')
    return out.join('')
  }
  return `${pick(4)}-${pick(4)}`
}
const createDeviceCode = internalMutation({
  args: { label: v.optional(v.string()) },
  handler: async (ctx, { label }) => {
    const deviceCode = `dc_${crypto.randomUUID().replaceAll('-', '')}`
    const userCode = randomUserCode()
    const expiresAt = Date.now() + DEVICE_CODE_TTL_MS
    await ctx.db.insert('cliDeviceCodes', { deviceCode, expiresAt, label, status: 'pending', userCode })
    return { deviceCode, expiresAt, userCode }
  }
})
interface PollResult {
  error?: 'NOT_FOUND'
  label?: null | string
  status?: 'authorized' | 'denied' | 'expired' | 'pending'
  token?: null | string
  userId?: null | string
}
const pollAndConsume = internalMutation({
  args: { deviceCode: v.string() },
  handler: async (ctx, { deviceCode }): Promise<PollResult> => {
    const row = await findDeviceCodeByDeviceCode(ctx, deviceCode)
    if (!row) return { error: 'NOT_FOUND' }
    if (row.status === 'pending' && row.expiresAt < Date.now()) {
      await ctx.db.patch(row._id, { status: 'expired' })
      return { status: 'expired' }
    }
    if (row.status !== 'authorized') return { status: row.status }
    const plaintext = row.plaintextOnce ?? null
    let tokenLabel: null | string = null
    if (row.tokenId) {
      const tokenRow = await ctx.db.get(row.tokenId)
      if (tokenRow) tokenLabel = tokenRow.label
    }
    if (plaintext) await ctx.db.patch(row._id, { plaintextOnce: undefined })
    return { label: tokenLabel, status: 'authorized', token: plaintext, userId: row.userId ?? null }
  }
})
interface AuthorizeResult {
  error?: 'ALREADY_HANDLED' | 'EXPIRED' | 'NOT_FOUND'
  ok: boolean
  tokenId?: Id<'cliTokens'>
}
const authorizeDeviceCode = internalMutation({
  args: { plaintextToken: v.string(), tokenLabel: v.string(), userCode: v.string(), userId: v.string() },
  handler: async (ctx, args): Promise<AuthorizeResult> => {
    const code = await findDeviceCodeByUserCode(ctx, args.userCode)
    if (!code) return { error: 'NOT_FOUND', ok: false }
    if (code.status !== 'pending') return { error: 'ALREADY_HANDLED', ok: false }
    if (code.expiresAt < Date.now()) {
      await ctx.db.patch(code._id, { status: 'expired' })
      return { error: 'EXPIRED', ok: false }
    }
    const tokenHash = await hashSecret(args.plaintextToken)
    const tokenId = await ctx.db.insert('cliTokens', {
      createdAt: Date.now(),
      label: args.tokenLabel,
      source: 'device-flow',
      tokenHash,
      userId: args.userId
    })
    await ctx.db.patch(code._id, {
      plaintextOnce: args.plaintextToken,
      status: 'authorized',
      tokenId,
      userId: args.userId
    })
    return { ok: true, tokenId }
  }
})
const denyDeviceCode = internalMutation({
  args: { userCode: v.string() },
  handler: async (ctx, { userCode }): Promise<{ ok: boolean }> => {
    const code = await findDeviceCodeByUserCode(ctx, userCode)
    if (!code) return { ok: false }
    await ctx.db.patch(code._id, { status: 'denied' })
    return { ok: true }
  }
})
const mintPatToken = internalMutation({
  args: { plaintextToken: v.string(), tokenLabel: v.string(), userId: v.string() },
  handler: async (ctx, args): Promise<{ tokenId: Id<'cliTokens'> }> => {
    const tokenHash = await hashSecret(args.plaintextToken)
    const tokenId = await ctx.db.insert('cliTokens', {
      createdAt: Date.now(),
      label: args.tokenLabel,
      source: 'pat',
      tokenHash,
      userId: args.userId
    })
    return { tokenId }
  }
})
const revokeTokenByHash = internalMutation({
  args: { tokenHash: v.string(), userId: v.string() },
  handler: async (ctx, { tokenHash, userId }): Promise<{ ok: boolean }> => {
    const row = await findCliTokenByHash(ctx, tokenHash)
    if (row?.userId !== userId) return { ok: false }
    await ctx.db.patch(row._id, { revokedAt: Date.now() })
    return { ok: true }
  }
})
interface ListedToken {
  _id: Id<'cliTokens'>
  createdAt: number
  label: string
  lastUsedAt: null | number
  revokedAt: null | number
  source: string
}
const listUserTokens = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }): Promise<ListedToken[]> => {
    const rows = await ctx.db
      .query('cliTokens')
      .withIndex('by_user', q => q.eq('userId', userId))
      .collect()
    return rows.map(r => ({
      _id: r._id,
      createdAt: r.createdAt,
      label: r.label,
      lastUsedAt: r.lastUsedAt ?? null,
      revokedAt: r.revokedAt ?? null,
      source: r.source
    }))
  }
})
const deviceInit = httpAction(async (ctx, req) => {
  let label: string | undefined
  try {
    const { label: parsed } = (await req.json()) as { label?: string }
    label = parsed
  } catch {
    label = undefined
  }
  const row = await ctx.runMutation(internal.tools._app.cliAuth.createDeviceCode, { label })
  return jsonRes(200, {
    deviceCode: row.deviceCode,
    expiresAt: row.expiresAt,
    pollIntervalMs: POLL_INTERVAL_MS,
    userCode: row.userCode,
    verificationUrl: '/device'
  })
})
const devicePoll = httpAction(async (ctx, req) => {
  let body: { deviceCode?: string }
  try {
    body = (await req.json()) as { deviceCode?: string }
  } catch {
    return errorRes({ code: 'INVALID_ARG', message: 'invalid JSON body', status: 400 })
  }
  const deviceCode = body.deviceCode ?? ''
  if (!deviceCode) return errorRes({ code: 'INVALID_ARG', message: 'deviceCode required', status: 400 })
  const row = await ctx.runMutation(internal.tools._app.cliAuth.pollAndConsume, { deviceCode })
  if (row.error === 'NOT_FOUND') return errorRes({ code: 'NOT_FOUND', message: 'unknown deviceCode', status: 404 })
  return jsonRes(200, row)
})
const tokensRevoke = httpAction(async (ctx, req) => {
  const auth = await ctx.auth.getUserIdentity()
  if (!auth) return errorRes({ code: 'UNAUTHORIZED', message: 'sign in required', status: 401 })
  let body: { token?: string }
  try {
    body = (await req.json()) as { token?: string }
  } catch {
    return errorRes({ code: 'INVALID_ARG', message: 'invalid JSON body', status: 400 })
  }
  const token = body.token ?? ''
  if (!token) return errorRes({ code: 'INVALID_ARG', message: 'token required', status: 400 })
  const tokenHash = await hashSecret(token)
  const result = await ctx.runMutation(internal.tools._app.cliAuth.revokeTokenByHash, {
    tokenHash,
    userId: auth.subject
  })
  return jsonRes(200, result)
})
const authorizeFromUserCode = mutation({
  args: { label: v.optional(v.string()), userCode: v.string() },
  handler: async (ctx, args): Promise<AuthorizeResult> => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return { error: 'NOT_FOUND', ok: false }
    const code = await findDeviceCodeByUserCode(ctx, args.userCode)
    if (!code) return { error: 'NOT_FOUND', ok: false }
    if (code.status !== 'pending') return { error: 'ALREADY_HANDLED', ok: false }
    if (code.expiresAt < Date.now()) {
      await ctx.db.patch(code._id, { status: 'expired' })
      return { error: 'EXPIRED', ok: false }
    }
    const plaintextToken = `cli_${crypto.randomUUID().replaceAll('-', '')}`
    const tokenHash = await hashSecret(plaintextToken)
    const tokenLabel = args.label ?? code.label ?? `cli on ${identity.email ?? identity.subject}`
    const tokenId = await ctx.db.insert('cliTokens', {
      createdAt: Date.now(),
      label: tokenLabel,
      source: 'device-flow',
      tokenHash,
      userId: identity.subject
    })
    await ctx.db.patch(code._id, {
      plaintextOnce: plaintextToken,
      status: 'authorized',
      tokenId,
      userId: identity.subject
    })
    return { ok: true, tokenId }
  }
})
const denyFromUserCode = mutation({
  args: { userCode: v.string() },
  handler: async (ctx, { userCode }): Promise<{ ok: boolean }> => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return { ok: false }
    const code = await findDeviceCodeByUserCode(ctx, userCode)
    if (!code) return { ok: false }
    await ctx.db.patch(code._id, { status: 'denied' })
    return { ok: true }
  }
})
const myTokens = query({
  args: {},
  handler: async (ctx): Promise<ListedToken[]> => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []
    const rows = await ctx.db
      .query('cliTokens')
      .withIndex('by_user', q => q.eq('userId', identity.subject))
      .collect()
    return rows.map(r => ({
      _id: r._id,
      createdAt: r.createdAt,
      label: r.label,
      lastUsedAt: r.lastUsedAt ?? null,
      revokedAt: r.revokedAt ?? null,
      source: r.source
    }))
  }
})
const revokeMyToken = mutation({
  args: { tokenId: v.id('cliTokens') },
  handler: async (ctx, { tokenId }): Promise<{ ok: boolean }> => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return { ok: false }
    const row = await ctx.db.get(tokenId)
    if (row?.userId !== identity.subject) return { ok: false }
    await ctx.db.patch(row._id, { revokedAt: Date.now() })
    return { ok: true }
  }
})
export {
  authorizeDeviceCode,
  authorizeFromUserCode,
  cliTokenAuth,
  cliTokenLookup,
  cliTokenTouch,
  createDeviceCode,
  denyDeviceCode,
  denyFromUserCode,
  deviceInit,
  devicePoll,
  listUserTokens,
  mintPatToken,
  myTokens,
  pollAndConsume,
  revokeMyToken,
  revokeTokenByHash,
  tokensRevoke
}
