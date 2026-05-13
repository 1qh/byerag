'use node'
import type { Sandbox } from 'e2b'
import { v } from 'convex/values'
import { z } from 'zod/v4'
import type { AgentSubtype } from './streamProtocol'
import { internal } from './_generated/api'
import { internalAction } from './_generated/server'
/* eslint-disable complexity */
import { AGENT_SCRIPT } from './agentScript'
/* oxlint-disable eslint(complexity) */
import { resolveApp } from './apps/manifest'
import { CLI_SCRIPT } from './cliScript'
import {
  CLAUDE_EFFORT,
  CLAUDE_MAX_BUDGET_USD,
  CLAUDE_MAX_TURNS,
  CLAUDE_MODEL,
  CLAUDE_SESSIONS_PATH,
  DISALLOWED_CHATID_CHAR_RE,
  SANDBOX_TIMEOUT_MS
} from './constants'
import { env } from './env'
import { connectSandbox, createSandbox } from './sandboxClient'
import { AGENT_RUN_PATH, buildSandboxEnv, prepareSandboxLayout, redactError, siteUrl } from './sandboxLaunch'
import { hashSecret } from './secretHash'
import { agentEventEnvelope } from './streamProtocol'
import { constantTimeEqual } from './utils'
const userMessageContent = z.object({
  message: z.object({
    content: z.array(z.object({ text: z.string(), type: z.literal('text') })),
    role: z.literal('user')
  })
})
const run = internalAction({
  args: {
    chatId: v.id('chats'),
    email: v.string(),
    secret: v.string()
  },
  handler: async (ctx, { chatId, email, secret }) => {
    const t0 = Date.now()
    let seq = -1000
    let sandbox: null | Sandbox = null
    let sandboxAction = ''
    const emit = async (subtype: AgentSubtype, data: Record<string, unknown> = {}) => {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({ chatId, elapsed: Date.now() - t0, event: `agent/${subtype}`, level: 'info' }))
      seq += 1
      await ctx.runMutation(internal.messages.insertAgentEvent, {
        chatId,
        content: agentEventEnvelope(subtype, t0, data),
        seq
      })
    }
    try {
      if (DISALLOWED_CHATID_CHAR_RE.test(chatId)) throw new Error('invalid chatId')
      const preAllowed = await ctx.runMutation(internal.lib.checkRateLimit, {
        max: 20,
        owner: `agent-run:${email}`
      })
      if (!preAllowed) throw new Error('agent run rate limited')
      await emit('start')
      const [lastUser, chat, sandboxDoc] = await Promise.all([
        ctx.runQuery(internal.messages.lastUserMessage, { chatId }),
        ctx.runQuery(internal.chats.get, { chatId }),
        ctx.runQuery(internal.sandboxes.getByOwner, { owner: email })
      ])
      if (!lastUser) throw new Error('no user message to process')
      const parsed = userMessageContent.safeParse(JSON.parse(lastUser.content))
      if (!(parsed.success && parsed.data.message.content[0]?.text))
        throw new Error('last user message malformed or empty')
      const { text } = parsed.data.message.content[0]
      if (sandboxDoc)
        try {
          await emit('sandbox_connect', { sandboxId: sandboxDoc.sandboxId })
          sandbox = await connectSandbox(sandboxDoc.sandboxId, {
            requestTimeoutMs: 60_000,
            timeoutMs: SANDBOX_TIMEOUT_MS
          })
          sandboxAction = 'reconnected'
          await ctx.runMutation(internal.sandboxes.touch, { owner: email })
        } catch (error) {
          await emit('sandbox_connect_failed', {
            error: redactError(error, secret).slice(0, 200),
            sandboxId: sandboxDoc.sandboxId
          })
          await ctx.runMutation(internal.sandboxes.remove, { owner: email, sandboxId: sandboxDoc.sandboxId })
          await ctx.scheduler.runAfter(0, internal.sandboxKill.killOnly, { sandboxId: sandboxDoc.sandboxId })
          sandbox = null
        }
      if (!sandbox) {
        const allowed = await ctx.runMutation(internal.lib.checkRateLimit, {
          max: 10,
          owner: `sandbox-create:${email}`
        })
        if (!allowed) throw new Error('sandbox create rate limited')
        await emit('sandbox_create', { template: env.TEMPLATE_ID })
        sandbox = await createSandbox(env.TEMPLATE_ID, { timeoutMs: SANDBOX_TIMEOUT_MS })
        const result: { accepted: boolean; existingSandboxId?: string } = await ctx.runMutation(
          internal.sandboxes.upsert,
          { owner: email, sandboxId: sandbox.sandboxId }
        )
        if (!result.accepted && result.existingSandboxId) {
          sandbox = await connectSandbox(result.existingSandboxId, {
            requestTimeoutMs: 60_000,
            timeoutMs: SANDBOX_TIMEOUT_MS
          })
          sandboxAction = 'reconnected'
        } else sandboxAction = 'created'
      }
      await emit('sandbox_ready', {
        action: sandboxAction,
        resumeSessionId: chat?.sessionId ?? '',
        sandboxId: sandbox.sandboxId
      })
      const pgidFile = `${CLAUDE_SESSIONS_PATH}/${chatId}/agent.pgid`
      if (!chat) throw new Error(`agent.run: chat ${chatId} not found`)
      const app = resolveApp(chat.app)
      await prepareSandboxLayout(sandbox, {
        agentScript: AGENT_SCRIPT,
        chatId,
        cliScript: CLI_SCRIPT,
        pgidFile,
        providers: app.cliProviders
      })
      await emit('script_uploaded')
      const logFile = `/home/user/.claude-tmp/${chatId}/agent.log`
      const systemPrompt = await app.buildSystemPrompt({ email, runQuery: async (ref, args) => ctx.runQuery(ref, args) })
      await sandbox.commands.run(`setsid bun run ${AGENT_RUN_PATH} >${logFile} 2>&1`, {
        background: true,
        envs: buildSandboxEnv({
          appId: app.id,
          chatId,
          convexSiteUrl: siteUrl(),
          effort: CLAUDE_EFFORT,
          maxBudgetUsd: CLAUDE_MAX_BUDGET_USD,
          maxTurns: CLAUDE_MAX_TURNS,
          model: CLAUDE_MODEL,
          pgidFile,
          resumeSessionId: chat.sessionId ?? '',
          secret,
          systemPrompt,
          userText: text
        })
      })
      await emit('process_started', { effort: CLAUDE_EFFORT, model: CLAUDE_MODEL })
      const started = await sandbox.commands.run(
        `for i in $(seq 1 120); do [ -s '${pgidFile}' ] && echo ok && exit 0; sleep 0.25; done; exit 1`,
        { timeoutMs: 35_000 }
      )
      if (started.exitCode !== 0) {
        await ctx.runMutation(internal.sandboxes.remove, { owner: email, sandboxId: sandbox.sandboxId })
        await ctx.scheduler.runAfter(0, internal.sandboxKill.killOnly, { sandboxId: sandbox.sandboxId })
        throw new Error('agent failed to start (pgid not written)')
      }
      await ctx.scheduler.runAfter(90_000, internal.agent.livenessCheck, { chatId, secret })
    } catch (error: unknown) {
      if (sandbox) {
        const current = await ctx.runQuery(internal.sandboxes.getByOwner, { owner: email })
        if (current?.sandboxId === sandbox.sandboxId) {
          await ctx.runMutation(internal.sandboxes.remove, { owner: email, sandboxId: sandbox.sandboxId })
          await ctx.scheduler.runAfter(0, internal.sandboxKill.killOnly, { sandboxId: sandbox.sandboxId })
        }
      }
      let redacted = 'agent failed'
      try {
        redacted = redactError(error, secret)
      } catch {
        /* Redact itself threw — use generic */
      }
      await ctx.runMutation(internal.messages.insertError, { chatId, error: redacted })
    }
  }
})
const livenessCheck = internalAction({
  args: { chatId: v.id('chats'), secret: v.string() },
  handler: async (ctx, { chatId, secret }) => {
    const chat = await ctx.runQuery(internal.chats.get, { chatId })
    if (!chat?.streaming) return
    const expected = await hashSecret(secret)
    if (!(chat.secretHash && constantTimeEqual(chat.secretHash, expected))) return
    const events = await ctx.runQuery(internal.messages.streamEventsForLiveness, { chatId })
    if (events.length > 0) return
    await ctx.runMutation(internal.messages.insertError, { chatId, error: 'agent silent: no events within 90s' })
  }
})
export { livenessCheck, run }
