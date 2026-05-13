import { authTables } from '@convex-dev/auth/server'
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
export default defineSchema({
  ...authTables,
  auditLogs: defineTable({
    args: v.string(),
    command: v.string(),
    mode: v.string(),
    ok: v.boolean(),
    owner: v.string(),
    severity: v.optional(v.union(v.literal('low'), v.literal('medium'), v.literal('high')))
  })
    .index('by_owner', ['owner'])
    .index('by_command', ['command'])
    .index('by_owner_command', ['owner', 'command'])
    .index('by_severity', ['severity']),
  chatRuntime: defineTable({
    chatId: v.id('chats'),
    proxyCallsThisTurn: v.optional(v.number()),
    streamEventCount: v.number()
  }).index('by_chat', ['chatId']),
  chats: defineTable({
    app: v.union(v.literal('admin'), v.literal('user')),
    deletedAt: v.optional(v.number()),
    isBookmarked: v.optional(v.boolean()),
    messageCount: v.number(),
    owner: v.string(),
    secretHash: v.string(),
    sessionId: v.optional(v.string()),
    streaming: v.boolean(),
    streamingStartedAt: v.number(),
    timeoutFunctionId: v.optional(v.id('_scheduled_functions')),
    title: v.string(),
    turns: v.number(),
    updatedAt: v.number()
  })
    .index('by_owner', ['owner'])
    .index('by_owner_streaming', ['owner', 'streaming'])
    .index('by_owner_updatedAt', ['owner', 'updatedAt'])
    .index('by_streaming_startedAt', ['streaming', 'streamingStartedAt'])
    .index('by_deletedAt', ['deletedAt']),
  cliDeviceCodes: defineTable({
    deviceCode: v.string(),
    expiresAt: v.number(),
    label: v.optional(v.string()),
    plaintextOnce: v.optional(v.string()),
    status: v.union(v.literal('pending'), v.literal('authorized'), v.literal('denied'), v.literal('expired')),
    tokenId: v.optional(v.id('cliTokens')),
    userCode: v.string(),
    userId: v.optional(v.string())
  })
    .index('by_deviceCode', ['deviceCode'])
    .index('by_userCode', ['userCode']),
  cliStreamEvents: defineTable({
    content: v.string(),
    expiresAt: v.number(),
    runId: v.string(),
    seq: v.number(),
    terminal: v.boolean(),
    userId: v.string()
  })
    .index('by_run', ['runId'])
    .index('by_run_seq', ['runId', 'seq'])
    .index('by_expires', ['expiresAt']),
  cliTokens: defineTable({
    createdAt: v.number(),
    label: v.string(),
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    source: v.union(v.literal('device-flow'), v.literal('pat'), v.literal('dev')),
    tokenHash: v.string(),
    userId: v.string()
  })
    .index('by_hash', ['tokenHash'])
    .index('by_user', ['userId']),
  costRecords: defineTable({
    cacheCreationInputTokens: v.number(),
    cacheReadInputTokens: v.number(),
    callCount: v.number(),
    cents: v.number(),
    dayKey: v.string(),
    inputTokens: v.number(),
    model: v.string(),
    outputTokens: v.number(),
    owner: v.string()
  })
    .index('by_owner_model_dayKey', ['owner', 'model', 'dayKey'])
    .index('by_dayKey', ['dayKey'])
    .index('by_owner_dayKey', ['owner', 'dayKey']),
  docChunks: defineTable({
    docId: v.id('docs'),
    embedding: v.array(v.float64()),
    end: v.number(),
    seq: v.number(),
    start: v.number(),
    text: v.string()
  })
    .index('by_doc', ['docId'])
    .index('by_doc_seq', ['docId', 'seq'])
    .vectorIndex('by_embedding', {
      dimensions: 768,
      filterFields: ['docId'],
      vectorField: 'embedding'
    }),
  docs: defineTable({
    deletedAt: v.optional(v.number()),
    embedding: v.optional(v.array(v.float64())),
    extractedText: v.optional(v.string()),
    fileSize: v.number(),
    filename: v.string(),
    lang: v.optional(v.string()),
    mime: v.string(),
    owner: v.optional(v.string()),
    policyCategory: v.optional(
      v.union(
        v.literal('on-topic'),
        v.literal('off-topic'),
        v.literal('spam'),
        v.literal('prompt-injection'),
        v.literal('abusive'),
        v.literal('promotional')
      )
    ),
    policyOverriddenBy: v.optional(v.string()),
    policyReason: v.optional(v.string()),
    policyReviewRequestedAt: v.optional(v.number()),
    policyStatus: v.union(v.literal('pending'), v.literal('approved'), v.literal('rejected')),
    scanCancelledAt: v.optional(v.number()),
    scanOverriddenAt: v.optional(v.number()),
    scanOverriddenBy: v.optional(v.string()),
    scanOverrideSignature: v.optional(v.string()),
    scanStatus: v.union(v.literal('pending'), v.literal('clean'), v.literal('quarantined')),
    scope: v.union(v.literal('shared'), v.literal('mine')),
    sha256: v.string(),
    storageId: v.optional(v.id('_storage')),
    summary: v.optional(v.string()),
    supersededBy: v.optional(v.id('docs')),
    supersedes: v.optional(v.id('docs')),
    uploadedAt: v.number(),
    uploadedBy: v.string(),
    version: v.number()
  })
    .index('by_scope', ['scope'])
    .index('by_owner', ['owner'])
    .index('by_scope_uploadedAt', ['scope', 'uploadedAt'])
    .index('by_supersedes', ['supersedes'])
    .index('by_deletedAt', ['deletedAt'])
    .index('by_sha256_scope_owner', ['sha256', 'scope', 'owner'])
    .index('by_filename_scope_owner', ['filename', 'scope', 'owner'])
    .index('by_policyStatus', ['policyStatus'])
    .index('by_scanOverriddenBy', ['scanOverriddenBy'])
    .vectorIndex('by_embedding', {
      dimensions: 768,
      filterFields: ['owner', 'scope'],
      vectorField: 'embedding'
    }),
  messages: defineTable({
    chatId: v.id('chats'),
    content: v.string(),
    seq: v.number(),
    type: v.union(
      v.literal('user'),
      v.literal('assistant'),
      v.literal('system'),
      v.literal('result'),
      v.literal('agent'),
      v.literal('error'),
      v.literal('rate_limit_event'),
      v.literal('stream_event')
    )
  })
    .index('by_chat', ['chatId'])
    .index('by_chat_type', ['chatId', 'type'])
    .index('by_chat_seq', ['chatId', 'seq']),
  ownerSpend: defineTable({
    centsToday: v.number(),
    dayKey: v.string(),
    inflight: v.optional(v.number()),
    owner: v.string()
  })
    .index('by_owner', ['owner'])
    .index('by_dayKey', ['dayKey']),
  rateLimits: defineTable({
    owner: v.string(),
    refilledAt: v.optional(v.number()),
    timestamps: v.optional(v.array(v.number())),
    tokens: v.optional(v.number()),
    updatedAt: v.optional(v.number())
  })
    .index('by_owner', ['owner'])
    .index('by_updatedAt', ['updatedAt']),
  sandboxes: defineTable({
    lastUsedAt: v.optional(v.number()),
    owner: v.string(),
    sandboxId: v.string()
  })
    .index('by_owner', ['owner'])
    .index('by_lastUsedAt', ['lastUsedAt']),
  settings: defineTable({
    key: v.string(),
    updatedAt: v.number(),
    updatedBy: v.string(),
    value: v.string()
  }).index('by_key', ['key']),
  streamEvents: defineTable({
    chatId: v.id('chats'),
    content: v.string(),
    seq: v.number()
  })
    .index('by_chat', ['chatId'])
    .index('by_chat_seq', ['chatId', 'seq']),
  userContexts: defineTable({
    activeContextHeartbeatAt: v.optional(v.number()),
    activeContextToken: v.optional(v.string()),
    busyChatId: v.optional(v.id('chats')),
    busyKind: v.optional(v.union(v.literal('agent'), v.literal('pipeline'))),
    busyUntil: v.optional(v.number()),
    userId: v.string()
  }).index('by_user', ['userId']),
  userProfiles: defineTable({
    department: v.optional(v.union(v.literal('HR'), v.literal('Sales'), v.literal('IT'))),
    role: v.union(v.literal('admin'), v.literal('user')),
    updatedAt: v.number(),
    updatedBy: v.string(),
    userId: v.string()
  })
    .index('by_userId', ['userId'])
    .index('by_role', ['role'])
})
