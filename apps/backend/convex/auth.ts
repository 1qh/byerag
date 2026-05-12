/** biome-ignore-all lint/style/noProcessEnv: Convex env read at runtime */
/** biome-ignore-all lint/nursery/noUndeclaredEnvVars: SITE_URL + ALLOWED_EMAILS via Convex env */
/* eslint-disable @typescript-eslint/require-await */
/* oxlint-disable eslint(complexity) */
import Google from '@auth/core/providers/google'
import { convexAuth } from '@convex-dev/auth/server'
import { parseAllowed, parseSiteUrls, validateProfileEmail, validateRedirectTo } from './authHelpers'
const { allowedOrigins: ALLOWED_ORIGINS, primary: PRIMARY_SITE_URL } = parseSiteUrls(process.env.SITE_URL)
if (process.env.PUBLIC_SIGNIN !== '1' && parseAllowed(process.env.ALLOWED_EMAILS).size === 0)
  // eslint-disable-next-line no-console
  console.warn('[auth] WARN: ALLOWED_EMAILS is empty or unset — all sign-ins will be rejected')
const { auth, isAuthenticated, signIn, signOut, store } = convexAuth({
  callbacks: {
    createOrUpdateUser: async (ctx, { existingUserId, profile }) => {
      const allowed = parseAllowed(process.env.ALLOWED_EMAILS)
      const publicSignin = process.env.PUBLIC_SIGNIN === '1'
      const existing = existingUserId ? ((await ctx.db.get(existingUserId)) as null | { email?: string }) : null
      const existingEmail = existing && typeof existing.email === 'string' ? existing.email : null
      const { canonicalEmail: email } = validateProfileEmail({ allowed, existingEmail, profile, publicSignin })
      if (existingUserId) return existingUserId
      const safeName =
        typeof profile.name === 'string' && profile.name.length > 0 && profile.name.length <= 200
          ? profile.name.trim().slice(0, 200)
          : undefined
      const rawImage = typeof profile.image === 'string' ? profile.image : ''
      const safeImage = rawImage.startsWith('https://') && rawImage.length <= 2000 ? rawImage : undefined
      // biome-ignore lint/nursery/noPlaywrightUselessAwait: Convex .first() is thenable
      const dup = (await ctx.db
        .query('users')
        .filter(q => q.eq(q.field('email'), email))
        .first()) as null | { _id: string; email?: string }
      if (dup) return dup._id as never
      const userId = await ctx.db.insert('users', {
        email,
        ...(safeName ? { name: safeName } : {}),
        ...(safeImage ? { image: safeImage } : {})
      })
      return userId
    },
    redirect: async ({ redirectTo }: { redirectTo: string }) =>
      validateRedirectTo({ allowedOrigins: ALLOWED_ORIGINS, primarySite: PRIMARY_SITE_URL, redirectTo })
  },
  providers: [Google]
})
export { auth, isAuthenticated, signIn, signOut, store }
