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
    extractedTextStorageId: v.optional(v.id('_storage')),
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
  testAssignments: defineTable({
    createdAt: v.number(),
    createdBy: v.string(),
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.string()),
    dueAtMs: v.optional(v.number()),
    topicId: v.id('topics'),
    userId: v.string()
  })
    .index('by_user_topic', ['userId', 'topicId'])
    .index('by_topic_deletedAt', ['topicId', 'deletedAt'])
    .index('by_user_deletedAt', ['userId', 'deletedAt']),
  testAttempts: defineTable({
    cancelledReason: v.optional(
      v.union(v.literal('new-attempt-started'), v.literal('topic-deleted'), v.literal('assignment-cancelled'))
    ),
    durationMs: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
    kind: v.union(v.literal('self'), v.literal('assigned')),
    questionSnapshots: v.array(
      v.object({
        choicesShuffled: v.array(v.string()),
        correctIndexShuffled: v.number(),
        promptText: v.string(),
        questionId: v.id('testQuestions'),
        revision: v.number(),
        sourceDocIds: v.array(v.id('docs')),
        userAnswerIndex: v.optional(v.number())
      })
    ),
    score: v.optional(v.number()),
    startedAt: v.number(),
    status: v.union(v.literal('in-progress'), v.literal('passed'), v.literal('failed'), v.literal('cancelled')),
    topicId: v.id('topics'),
    userId: v.string()
  })
    .index('by_user', ['userId'])
    .index('by_user_topic', ['userId', 'topicId'])
    .index('by_topic_status', ['topicId', 'status'])
    .index('by_status_startedAt', ['status', 'startedAt']),
  testPasses: defineTable({
    attemptId: v.id('testAttempts'),
    kind: v.union(v.literal('self'), v.literal('assigned')),
    passedAt: v.number(),
    topicId: v.id('topics'),
    userId: v.string()
  })
    .index('by_user_topic_kind', ['userId', 'topicId', 'kind'])
    .index('by_topic_kind_passedAt', ['topicId', 'kind', 'passedAt'])
    .index('by_user', ['userId']),
  testQuestionSuggestions: defineTable({
    choices: v.optional(v.array(v.string())),
    correctIndex: v.optional(v.number()),
    createdAt: v.number(),
    kind: v.union(v.literal('new'), v.literal('retire')),
    pairKind: v.optional(v.union(v.literal('conflict'), v.literal('cap-swap'))),
    pairedWith: v.optional(v.id('testQuestionSuggestions')),
    prompt: v.optional(v.string()),
    promptEmbedding: v.optional(v.array(v.float64())),
    reason: v.optional(v.string()),
    resolvedAction: v.optional(v.union(v.literal('approve'), v.literal('reject'), v.literal('auto-rejected'))),
    resolvedAt: v.optional(v.number()),
    resolvedBy: v.optional(v.string()),
    resolvedReason: v.optional(
      v.union(v.literal('admin-action'), v.literal('source-doc-deleted'), v.literal('topic-deleted'))
    ),
    sourceDocIds: v.array(v.id('docs')),
    status: v.union(v.literal('pending'), v.literal('resolved')),
    targetQuestionId: v.optional(v.id('testQuestions')),
    topicId: v.id('topics')
  })
    .index('by_topic_status', ['topicId', 'status'])
    .index('by_pair', ['pairedWith'])
    .index('by_target', ['targetQuestionId'])
    .index('by_resolvedAt', ['resolvedAt']),
  testQuestions: defineTable({
    choices: v.array(v.string()),
    correctIndex: v.number(),
    createdAt: v.number(),
    createdBy: v.string(),
    deleteReason: v.optional(
      v.union(
        v.literal('admin-retire'),
        v.literal('agent-retire-conflict'),
        v.literal('source-doc-cascade'),
        v.literal('topic-cascade')
      )
    ),
    deletedAt: v.optional(v.number()),
    prompt: v.string(),
    revision: v.number(),
    sourceDocIds: v.array(v.id('docs')),
    topicId: v.id('topics')
  })
    .index('by_topic', ['topicId'])
    .index('by_topic_deletedAt', ['topicId', 'deletedAt'])
    .index('by_deletedAt', ['deletedAt'])
    .index('by_sourceDocIds', ['sourceDocIds']),
  topics: defineTable({
    autoLabeled: v.boolean(),
    centroid: v.optional(v.array(v.float64())),
    createdAt: v.number(),
    deletedAt: v.optional(v.number()),
    lastSubstantiveUpdate: v.optional(v.number()),
    name: v.string(),
    poolCap: v.number()
  })
    .index('by_deletedAt', ['deletedAt'])
    .index('by_name', ['name']),
  userContexts: defineTable({
    activeContextHeartbeatAt: v.optional(v.number()),
    activeContextToken: v.optional(v.string()),
    busyChatId: v.optional(v.id('chats')),
    busyKind: v.optional(v.union(v.literal('agent'), v.literal('pipeline'))),
    busyUntil: v.optional(v.number()),
    userId: v.string()
  }).index('by_user', ['userId']),
  userProfiles: defineTable({
    department: v.optional(v.literal('Safety, Health and Environment')),
    role: v.union(v.literal('admin'), v.literal('user')),
    updatedAt: v.number(),
    updatedBy: v.string(),
    userId: v.string()
  })
    .index('by_userId', ['userId'])
    .index('by_role', ['role']),
  xTraces: defineTable({
    args: v.string(),
    command: v.string(),
    durationMs: v.number(),
    error: v.optional(v.string()),
    expiresAt: v.number(),
    inputsResolved: v.optional(v.string()),
    mode: v.string(),
    ok: v.boolean(),
    owner: v.string(),
    steps: v.optional(v.string()),
    traceId: v.string()
  })
    .index('by_expires', ['expiresAt'])
    .index('by_owner', ['owner'])
    .index('by_trace', ['traceId'])
})
