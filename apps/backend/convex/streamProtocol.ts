import { z } from 'zod/v4'
type ContentBlock =
  | {
      content?: unknown
      tool_use_id?: string
      type: 'code_execution_tool_result' | 'tool_result' | 'web_fetch_tool_result' | 'web_search_tool_result'
    }
  | { id?: string; input?: Record<string, unknown>; name?: string; type: 'server_tool_use' | 'tool_use' }
  | { text?: string; type: 'text' }
  | { thinking?: string; type: 'thinking' }
const usage = z.object({
  cache_creation_input_tokens: z.number().optional(),
  cache_read_input_tokens: z.number().optional(),
  inference_geo: z.string().optional(),
  input_tokens: z.number().optional(),
  output_tokens: z.number().optional(),
  service_tier: z.string().optional()
})
const anthropicMessage = z.object({
  content: z
    .array(z.looseObject({ text: z.string().optional(), thinking: z.string().optional(), type: z.string() }))
    .nullable()
    .optional(),
  id: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  stop_reason: z.string().nullable().optional(),
  usage: usage.nullable().optional()
})
const streamEvent = z.discriminatedUnion('type', [
  z.object({
    action: z.string().optional(),
    elapsed: z.number().optional(),
    model: z.string().optional(),
    sandboxId: z.string().optional(),
    subtype: z
      .enum([
        'process_started',
        'sandbox_connect',
        'sandbox_connect_failed',
        'sandbox_create',
        'sandbox_ready',
        'script_uploaded',
        'start'
      ])
      .optional(),
    template: z.string().optional(),
    type: z.literal('agent')
  }),
  z.object({
    agents: z.array(z.string()).optional(),
    apiKeySource: z.string().optional(),
    attempt: z.number().optional(),
    claude_code_version: z.string().optional(),
    cwd: z.string().optional(),
    error: z.string().optional(),
    error_status: z.number().optional(),
    fast_mode_state: z.string().optional(),
    max_retries: z.number().optional(),
    mcp_servers: z.array(z.string()).optional(),
    model: z.string().optional(),
    permissionMode: z.string().optional(),
    retry_delay_ms: z.number().optional(),
    session_id: z.string().optional(),
    subtype: z.string().optional(),
    tools: z.array(z.string()).optional(),
    type: z.literal('system')
  }),
  z.object({ message: anthropicMessage.optional(), type: z.literal('assistant') }),
  z.object({ message: anthropicMessage.optional(), type: z.literal('user') }),
  z.object({
    result: z.object({ cost_usd: z.number().optional() }).optional(),
    subtype: z.string().optional(),
    type: z.literal('result')
  }),
  z.object({
    rate_limit_info: z
      .object({
        isUsingOverage: z.boolean().optional(),
        rateLimitType: z.string().optional(),
        resetsAt: z.number().optional(),
        status: z.string().optional()
      })
      .optional(),
    type: z.literal('rate_limit_event')
  }),
  z.object({ error: z.string().optional(), type: z.literal('error') }),
  z.object({
    event: z.record(z.string(), z.unknown()).optional(),
    parent_tool_use_id: z.string().nullable().optional(),
    type: z.literal('stream_event'),
    uuid: z.string().optional()
  })
])
type StreamEvent = z.infer<typeof streamEvent>
const sdkEnvelope = z.object({
  message: z.object({
    content: z.array(z.looseObject({ text: z.string().optional(), type: z.string() })).optional()
  }),
  type: z.string()
})
const rawEnvelope = z.object({
  content: z.array(z.looseObject({ text: z.string().optional(), type: z.string() })),
  role: z.string()
})
type AgentSubtype =
  | 'process_started'
  | 'sandbox_connect'
  | 'sandbox_connect_failed'
  | 'sandbox_create'
  | 'sandbox_ready'
  | 'script_uploaded'
  | 'start'
const agentEventEnvelope = (subtype: AgentSubtype, t0: number, data: Record<string, unknown>): string =>
  JSON.stringify({ ...data, elapsed: Date.now() - t0, subtype, ts: Date.now(), type: 'agent' })
const errorEventEnvelope = (error: string): string => JSON.stringify({ error, type: 'error' })
export { agentEventEnvelope, anthropicMessage, errorEventEnvelope, rawEnvelope, sdkEnvelope, streamEvent, usage }
export type { AgentSubtype, ContentBlock, StreamEvent }
