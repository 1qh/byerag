import { getAuthUserId } from '@convex-dev/auth/server'
import { z } from 'zod/v4'
import type { MutationCtx, QueryCtx } from './_generated/server'

const authUser = z.object({
  email: z.string().optional(),
  image: z.string().optional(),
  name: z.string().optional()
})
type AuthUser = z.infer<typeof authUser>
const getAuthUser = async (ctx: MutationCtx | QueryCtx) => {
  const userId = await getAuthUserId(ctx)
  if (!userId) return null
  const doc = await ctx.db.get(userId)
  if (!doc) return null
  const parsed = authUser.safeParse(doc)
  return parsed.success ? parsed.data : null
}
const getOwnerEmailOrNull = async (ctx: MutationCtx | QueryCtx): Promise<null | string> => {
  const user = await getAuthUser(ctx)
  return user?.email ?? null
}
const requireOwnerEmail = async (ctx: MutationCtx | QueryCtx): Promise<string> => {
  const user = await getAuthUser(ctx)
  if (!user?.email) throw new Error('not authenticated')
  return user.email
}
const canonicalizeEmail = (email: string): string => {
  const lower = email.trim().toLowerCase()
  const at = lower.indexOf('@')
  if (at === -1) return lower
  const local = lower.slice(0, at)
  const domain = lower.slice(at + 1)
  const plus = local.indexOf('+')
  const stripped = plus === -1 ? local : local.slice(0, plus)
  const noDots = domain === 'gmail.com' || domain === 'googlemail.com' ? stripped.replaceAll('.', '') : stripped
  return `${noDots}@${domain}`
}
const parseAllowed = (csv: string | undefined): Set<string> =>
  new Set(
    (csv ?? '')
      .split(',')
      .map(s => canonicalizeEmail(s))
      .filter(Boolean)
  )
const normalizeOrigin = (u: string): string => {
  try {
    return new URL(u).origin.toLowerCase()
  } catch {
    return ''
  }
}
const parseSiteUrls = (csv: string | undefined): { allowedOrigins: Set<string>; primary: string; siteUrls: string[] } => {
  const siteUrls = (csv ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  return {
    allowedOrigins: new Set(siteUrls.map(normalizeOrigin).filter(Boolean)),
    primary: siteUrls[0] ?? '',
    siteUrls
  }
}
interface ProfileLike {
  email?: unknown
  email_verified?: unknown
}
interface ValidateOpts {
  existingEmail: null | string
  profile: ProfileLike
}
const validateProfileEmail = ({ profile, existingEmail }: ValidateOpts): { canonicalEmail: string } => {
  const rawEmail = typeof profile.email === 'string' ? profile.email.toLowerCase() : ''
  const canonicalEmail = canonicalizeEmail(rawEmail)
  if (!(canonicalEmail && rawEmail)) throw new Error('Email missing or invalid')
  if (profile.email_verified === false) throw new Error('Email not verified by provider')
  if (existingEmail !== null) {
    const canonicalExisting = canonicalizeEmail(existingEmail)
    if (canonicalExisting && canonicalExisting !== canonicalEmail)
      throw new Error('Email mismatch — existing account vs current sign-in')
  }
  return { canonicalEmail }
}
const ENCODED_TRAVERSAL = ['\\', '%2f%2f', '%5c', '%09', '%0a', '%0d']
interface RedirectInputs {
  allowedOrigins: Set<string>
  primarySite: string
  redirectTo: unknown
}
const validateRedirectTo = ({ allowedOrigins, primarySite, redirectTo }: RedirectInputs): string => {
  if (typeof redirectTo !== 'string') throw new Error(`Expected string redirectTo, got ${typeof redirectTo}`)
  const pathOnly = redirectTo.split('?')[0]?.split('#')[0] ?? ''
  const loweredPath = pathOnly.toLowerCase()
  for (const banned of ENCODED_TRAVERSAL)
    if (loweredPath.includes(banned)) throw new Error('redirectTo contains disallowed encoded chars')
  if (redirectTo.startsWith('//') || redirectTo.startsWith('/\\'))
    throw new Error('redirectTo protocol-relative path not allowed')
  if (redirectTo.startsWith('/')) {
    let resolved: string
    try {
      resolved = new URL(redirectTo, primarySite).origin
    } catch (parseError) {
      throw new Error('redirectTo path parse failed', { cause: parseError })
    }
    if (resolved.toLowerCase() !== normalizeOrigin(primarySite))
      throw new Error('redirectTo path resolves to foreign origin')
    return `${primarySite}${redirectTo}`
  }
  let parsed: URL
  try {
    parsed = new URL(redirectTo)
  } catch (parseError) {
    throw new Error('Invalid redirectTo URL', { cause: parseError })
  }
  if (!allowedOrigins.has(parsed.origin.toLowerCase())) throw new Error('redirectTo origin not allowed')
  return `${parsed.origin}${parsed.pathname}${parsed.search}`
}
export {
  authUser,
  canonicalizeEmail,
  getAuthUser,
  getOwnerEmailOrNull,
  normalizeOrigin,
  parseAllowed,
  parseSiteUrls,
  requireOwnerEmail,
  validateProfileEmail,
  validateRedirectTo
}
export type { AuthUser, ProfileLike, RedirectInputs }
