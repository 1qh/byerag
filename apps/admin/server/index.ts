import type { AppConfig } from 'backend/convex/apps/types'
import { buildAgentPrompt } from './prompt'
const config: AppConfig = {
  buildSystemPrompt: buildAgentPrompt,
  cliProviders: [],
  id: 'admin',
  optionalEnvKeys: [],
  skills: {},
  smokeDir: 'apps/admin',
  syncTargetKeys: []
}
export { config }
