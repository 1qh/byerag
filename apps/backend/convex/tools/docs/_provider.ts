import { defineProvider } from '../_api'
export default defineProvider({
  description: 'Corpus document tools: list, read, grep, diff over shared + mine scopes',
  enabled: true,
  name: 'docs',
  requiresEnv: []
})
