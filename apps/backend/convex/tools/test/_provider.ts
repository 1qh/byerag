import { defineProvider } from '../_api'

export default defineProvider({
  description: 'Dispatch fixture — a side-effect-free echo for exercising auth, tiers, and arg validation end-to-end.',
  enabled: true,
  name: 'test',
  requiresEnv: []
})
