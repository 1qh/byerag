import type { FunctionReference } from 'convex/server'
import type { ArgSpecs, ProviderMeta, RegistryEntry, ToolMeta } from '@a/cli'
import { internal } from '../../_generated/api'
import docs_provider from '../docs/_provider'
import { action as docsDiff_mod } from '../docs/diff'
import { action as docsGrep_mod } from '../docs/grep'
import { action as docsList_mod } from '../docs/list'
import { action as docsRead_mod } from '../docs/read'
const PROVIDERS: Record<string, ProviderMeta> = {
  "docs": docs_provider,
}
const REGISTRY: Record<string, RegistryEntry<'admin' | 'user'>> = {
  "docs.diff": {
    argSpecs: (docsDiff_mod as unknown as { argSpecs: ArgSpecs }).argSpecs,
    fn: internal.tools.docs.diff.action as FunctionReference<'query', 'internal'>,
    inferredDescription: null,
    inferredSchema: {"kind":"object","shape":{"a":{"optional":false,"schema":{"kind":"object","shape":{"_id":{"optional":false,"schema":{"kind":"union","members":[{"kind":"unknown","text":"Id<\"chats\">"},{"kind":"unknown","text":"Id<\"cliTokens\">"},{"kind":"unknown","text":"Id<\"docs\">"},{"kind":"unknown","text":"Id<\"users\">"},{"kind":"unknown","text":"Id<\"authSessions\">"},{"kind":"unknown","text":"Id<\"authRefreshTokens\">"},{"kind":"unknown","text":"Id<\"authAccounts\">"},{"kind":"unknown","text":"Id<\"auditLogs\">"},{"kind":"unknown","text":"Id<\"chatRuntime\">"},{"kind":"unknown","text":"Id<\"cliDeviceCodes\">"},{"kind":"unknown","text":"Id<\"cliStreamEvents\">"},{"kind":"unknown","text":"Id<\"costRecords\">"},{"kind":"unknown","text":"Id<\"docChunks\">"},{"kind":"unknown","text":"Id<\"messages\">"},{"kind":"unknown","text":"Id<\"ownerSpend\">"},{"kind":"unknown","text":"Id<\"rateLimits\">"},{"kind":"unknown","text":"Id<\"sandboxes\">"},{"kind":"unknown","text":"Id<\"settings\">"},{"kind":"unknown","text":"Id<\"streamEvents\">"},{"kind":"unknown","text":"Id<\"userContexts\">"},{"kind":"unknown","text":"Id<\"userProfiles\">"},{"kind":"unknown","text":"Id<\"authVerificationCodes\">"},{"kind":"unknown","text":"Id<\"authVerifiers\">"},{"kind":"unknown","text":"Id<\"authRateLimits\">"}]}},"filename":{"optional":false,"schema":{"kind":"unknown","text":"any"}}}}},"b":{"optional":false,"schema":{"kind":"object","shape":{"_id":{"optional":false,"schema":{"kind":"union","members":[{"kind":"unknown","text":"Id<\"chats\">"},{"kind":"unknown","text":"Id<\"cliTokens\">"},{"kind":"unknown","text":"Id<\"docs\">"},{"kind":"unknown","text":"Id<\"users\">"},{"kind":"unknown","text":"Id<\"authSessions\">"},{"kind":"unknown","text":"Id<\"authRefreshTokens\">"},{"kind":"unknown","text":"Id<\"authAccounts\">"},{"kind":"unknown","text":"Id<\"auditLogs\">"},{"kind":"unknown","text":"Id<\"chatRuntime\">"},{"kind":"unknown","text":"Id<\"cliDeviceCodes\">"},{"kind":"unknown","text":"Id<\"cliStreamEvents\">"},{"kind":"unknown","text":"Id<\"costRecords\">"},{"kind":"unknown","text":"Id<\"docChunks\">"},{"kind":"unknown","text":"Id<\"messages\">"},{"kind":"unknown","text":"Id<\"ownerSpend\">"},{"kind":"unknown","text":"Id<\"rateLimits\">"},{"kind":"unknown","text":"Id<\"sandboxes\">"},{"kind":"unknown","text":"Id<\"settings\">"},{"kind":"unknown","text":"Id<\"streamEvents\">"},{"kind":"unknown","text":"Id<\"userContexts\">"},{"kind":"unknown","text":"Id<\"userProfiles\">"},{"kind":"unknown","text":"Id<\"authVerificationCodes\">"},{"kind":"unknown","text":"Id<\"authVerifiers\">"},{"kind":"unknown","text":"Id<\"authRateLimits\">"}]}},"filename":{"optional":false,"schema":{"kind":"unknown","text":"any"}}}}},"diff":{"optional":false,"schema":{"kind":"string"}}}},
    kind: 'query',
    meta: (docsDiff_mod as unknown as { meta: ToolMeta }).meta,
    path: ["docs","diff"],
    tier: "user"
  },
  "docs.grep": {
    argSpecs: (docsGrep_mod as unknown as { argSpecs: ArgSpecs }).argSpecs,
    fn: internal.tools.docs.grep.action as FunctionReference<'query', 'internal'>,
    inferredDescription: null,
    inferredSchema: {"kind":"object","shape":{"hits":{"optional":false,"schema":{"element":{"kind":"object","shape":{"docId":{"optional":false,"schema":{"kind":"string"}},"filename":{"optional":false,"schema":{"kind":"string"}},"lineNumber":{"optional":false,"schema":{"kind":"number"}},"snippet":{"optional":false,"schema":{"kind":"string"}}}},"kind":"array"}},"truncated":{"optional":false,"schema":{"kind":"boolean"}}}},
    kind: 'query',
    meta: (docsGrep_mod as unknown as { meta: ToolMeta }).meta,
    path: ["docs","grep"],
    tier: "user"
  },
  "docs.list": {
    argSpecs: (docsList_mod as unknown as { argSpecs: ArgSpecs }).argSpecs,
    fn: internal.tools.docs.list.action as FunctionReference<'query', 'internal'>,
    inferredDescription: null,
    inferredSchema: {"element":{"kind":"object","shape":{"_id":{"optional":false,"schema":{"kind":"unknown","text":"Id<\"docs\">"}},"filename":{"optional":false,"schema":{"kind":"string"}},"fileSize":{"optional":false,"schema":{"kind":"number"}},"mime":{"optional":false,"schema":{"kind":"string"}},"scope":{"optional":false,"schema":{"kind":"enum","values":["mine","shared"]}},"uploadedAt":{"optional":false,"schema":{"kind":"number"}}}},"kind":"array"},
    kind: 'query',
    meta: (docsList_mod as unknown as { meta: ToolMeta }).meta,
    path: ["docs","list"],
    tier: "user"
  },
  "docs.read": {
    argSpecs: (docsRead_mod as unknown as { argSpecs: ArgSpecs }).argSpecs,
    fn: internal.tools.docs.read.action as FunctionReference<'query', 'internal'>,
    inferredDescription: null,
    inferredSchema: {"kind":"object","shape":{"_id":{"optional":false,"schema":{"kind":"union","members":[{"kind":"unknown","text":"Id<\"chats\">"},{"kind":"unknown","text":"Id<\"cliTokens\">"},{"kind":"unknown","text":"Id<\"docs\">"},{"kind":"unknown","text":"Id<\"users\">"},{"kind":"unknown","text":"Id<\"authSessions\">"},{"kind":"unknown","text":"Id<\"authRefreshTokens\">"},{"kind":"unknown","text":"Id<\"authAccounts\">"},{"kind":"unknown","text":"Id<\"auditLogs\">"},{"kind":"unknown","text":"Id<\"chatRuntime\">"},{"kind":"unknown","text":"Id<\"cliDeviceCodes\">"},{"kind":"unknown","text":"Id<\"cliStreamEvents\">"},{"kind":"unknown","text":"Id<\"costRecords\">"},{"kind":"unknown","text":"Id<\"docChunks\">"},{"kind":"unknown","text":"Id<\"messages\">"},{"kind":"unknown","text":"Id<\"ownerSpend\">"},{"kind":"unknown","text":"Id<\"rateLimits\">"},{"kind":"unknown","text":"Id<\"sandboxes\">"},{"kind":"unknown","text":"Id<\"settings\">"},{"kind":"unknown","text":"Id<\"streamEvents\">"},{"kind":"unknown","text":"Id<\"userContexts\">"},{"kind":"unknown","text":"Id<\"userProfiles\">"},{"kind":"unknown","text":"Id<\"authVerificationCodes\">"},{"kind":"unknown","text":"Id<\"authVerifiers\">"},{"kind":"unknown","text":"Id<\"authRateLimits\">"}]}},"content":{"optional":false,"schema":{"kind":"unknown","text":"any"}},"filename":{"optional":false,"schema":{"kind":"unknown","text":"any"}},"lang":{"optional":false,"schema":{"kind":"unknown","text":"any"}},"mime":{"optional":false,"schema":{"kind":"unknown","text":"any"}},"scope":{"optional":false,"schema":{"kind":"unknown","text":"any"}},"truncated":{"optional":false,"schema":{"kind":"boolean"}},"version":{"optional":false,"schema":{"kind":"unknown","text":"any"}}}},
    kind: 'query',
    meta: (docsRead_mod as unknown as { meta: ToolMeta }).meta,
    path: ["docs","read"],
    tier: "user"
  },
}
export { PROVIDERS, REGISTRY }
