import type { PublicHttpAction } from 'convex/server'
import type { ActionCtx } from '../_generated/server'
interface AppConfig {
  buildSystemPrompt: (ctx: AppPromptCtx) => Promise<string> | string
  cliProviders: readonly string[]
  httpRoutes?: readonly AppHttpRoute[]
  id: string
  optionalEnvKeys: readonly string[]
  skills: Record<string, string>
  smokeDir: string
  syncTargetKeys: readonly string[]
}
interface AppHttpRoute {
  handler: PublicHttpAction
  method: 'GET' | 'POST'
  path: string
}
interface AppPromptCtx {
  email: string
  runQuery: ActionCtx['runQuery']
}
export type { AppConfig, AppPromptCtx }
