import { v } from 'convex/values'
const AUTH_MODES = v.union(v.literal('admin'), v.literal('dev'), v.literal('sandbox'), v.literal('token'))
const AUTH_TIERS = v.union(v.literal('admin'), v.literal('user'))
const AUTH_VALIDATOR = v.object({
  mode: AUTH_MODES,
  owner: v.string(),
  tier: AUTH_TIERS
})
interface ResolvedAuth {
  mode: 'admin' | 'dev' | 'sandbox' | 'token'
  owner: string
  tier: 'admin' | 'user'
}
type Tier = 'admin' | 'user'
export { AUTH_VALIDATOR }
export type { ResolvedAuth, Tier }
