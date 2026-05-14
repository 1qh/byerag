import type { AppConfig } from 'backend/convex/apps/types'
import { buildAgentPrompt } from './prompt'
const config: AppConfig = {
  buildSystemPrompt: buildAgentPrompt,
  cliProviders: ['docs'],
  id: 'user',
  optionalEnvKeys: [],
  skills: {},
  smokeDir: 'apps/user',
  syncTargetKeys: []
}
export { config }
