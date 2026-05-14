/** biome-ignore-all lint/style/noProcessEnv: Convex env read at runtime */
/** biome-ignore-all lint/nursery/noUndeclaredEnvVars: SITE_URL + BOOTSTRAP_ADMIN_EMAIL via Convex env */
/* eslint-disable @typescript-eslint/require-await */
/* oxlint-disable eslint(complexity) */
import Google from '@auth/core/providers/google'
import { convexAuth } from '@convex-dev/auth/server'
import type { DatabaseWriter } from './_generated/server'
import { parseAllowed, parseSiteUrls, validateProfileEmail, validateRedirectTo } from './authHelpers'
const { allowedOrigins: ALLOWED_ORIGINS, primary: PRIMARY_SITE_URL } = parseSiteUrls(process.env.SITE_URL)
const BOOTSTRAP_ADMIN_EMAILS = parseAllowed(process.env.BOOTSTRAP_ADMIN_EMAIL)
if (BOOTSTRAP_ADMIN_EMAILS.size === 0)
  // eslint-disable-next-line no-console
  console.warn('[auth] WARN: BOOTSTRAP_ADMIN_EMAIL is empty or unset — no admin will be seeded on first sign-in')
const { auth, isAuthenticated, signIn, signOut, store } = convexAuth({
  callbacks: {
    createOrUpdateUser: async (ctx, { existingUserId, profile }) => {
      const existing = existingUserId ? ((await ctx.db.get(existingUserId)) as null | { email?: string }) : null
      const existingEmail = existing && typeof existing.email === 'string' ? existing.email : null
      const { canonicalEmail: email } = validateProfileEmail({ existingEmail, profile })
      if (existingUserId) return existingUserId
      const safeName =
        typeof profile.name === 'string' && profile.name.length > 0 && profile.name.length <= 200
          ? profile.name.trim().slice(0, 200)
          : undefined
      const rawImage = typeof profile.image === 'string' ? profile.image : ''
      const safeImage = rawImage.startsWith('https://') && rawImage.length <= 2000 ? rawImage : undefined
      const db = ctx.db as unknown as DatabaseWriter
      const dupRows = (await db
        .query('users')
        .filter(q => q.eq(q.field('email'), email))
        .collect()) as { _id: string; email?: string }[]
      const dup = dupRows[0] ?? null
      const userId = dup
        ? (dup._id as never)
        : await ctx.db.insert('users', {
            email,
            ...(safeName ? { name: safeName } : {}),
            ...(safeImage ? { image: safeImage } : {})
          })
      const profileRows = (await db
        .query('userProfiles')
        .withIndex('by_userId', q => q.eq('userId', email))
        .collect()) as { _id: string }[]
      const existingProfile = profileRows[0] ?? null
      if (!existingProfile) {
        const role = BOOTSTRAP_ADMIN_EMAILS.has(email) ? 'admin' : 'user'
        await ctx.db.insert('userProfiles', {
          role,
          updatedAt: Date.now(),
          updatedBy: 'self',
          userId: email
        })
      }
      return userId
    },
    redirect: async ({ redirectTo }: { redirectTo: string }) =>
      validateRedirectTo({ allowedOrigins: ALLOWED_ORIGINS, primarySite: PRIMARY_SITE_URL, redirectTo })
  },
  providers: [Google]
})
export { auth, isAuthenticated, signIn, signOut, store }
