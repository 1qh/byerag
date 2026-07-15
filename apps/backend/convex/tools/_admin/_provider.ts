import { defineProvider } from '../_api'

export default defineProvider({
  description: 'Operator tools — audit history and dispatch-trace lookup. Admin tier.',
  enabled: true,
  name: 'admin',
  requiresEnv: []
})
