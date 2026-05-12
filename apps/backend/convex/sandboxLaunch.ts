'use node'
import type { Sandbox } from 'e2b'
import { CLAUDE_SESSIONS_PATH, CLAUDE_SHARED_MEMORY_PATH, CLAUDE_TMP_PATH } from './constants'
import { env as siteEnv } from './env'
import { redactSecrets } from './redactor'
const HOME = '/home/user'
const AGENT_DIR = `${HOME}/agent`
const WORKSPACE = `${HOME}/workspace`
const SANDBOX_PATH = [`${AGENT_DIR}/node_modules/.bin`, '/usr/local/bin', '/usr/bin', '/bin'].join(':')
const CLAUDE_CLI_PATH = `${AGENT_DIR}/node_modules/@anthropic-ai/claude-code/bin/claude.exe`
const AGENT_RUN_PATH = `${AGENT_DIR}/run.ts`
const AGENT_CLI_PATH = `${AGENT_DIR}/cli.mjs`
interface SandboxEnvInput {
  appId: string
  chatId: string
  convexSiteUrl: string
  effort: string
  maxBudgetUsd: string
  maxTurns: string
  model: string
  pgidFile: string
  resumeSessionId: string
  secret: string
  systemPrompt: string
  userText: string
}
const buildSandboxEnv = (opts: SandboxEnvInput): Record<string, string> => ({
  ANTHROPIC_BASE_URL: `${opts.convexSiteUrl}/api/anthropic`,
  CHAT_APP: opts.appId,
  CHAT_ID: opts.chatId,
  CHAT_SECRET: opts.secret,
  CLAUDE_CODE_REMOTE_MEMORY_DIR: `${CLAUDE_SHARED_MEMORY_PATH}/${opts.chatId}`,
  CLAUDE_CONFIG_DIR: `${CLAUDE_SESSIONS_PATH}/${opts.chatId}`,
  CLAUDE_TMPDIR: `${CLAUDE_TMP_PATH}/${opts.chatId}`,
  CLI_SESSION_ID: opts.chatId,
  CLI_SESSION_SECRET: opts.secret,
  CONVEX_SITE_URL: opts.convexSiteUrl,
  EFFORT: opts.effort,
  HOME,
  MAX_BUDGET_USD: opts.maxBudgetUsd,
  MAX_TURNS: opts.maxTurns,
  MODEL: opts.model,
  PATH: SANDBOX_PATH,
  PGID_FILE: opts.pgidFile,
  RESUME_SESSION_ID: opts.resumeSessionId,
  SYSTEM_PROMPT: opts.systemPrompt,
  USER_TEXT: opts.userText
})
const CLI_PREFIX_RE = /^_/u
const PROVIDER_NAME_RE = /^[a-z][a-z0-9-]{0,31}$/u
const siteUrl = (): string => {
  const url = siteEnv.CONVEX_SITE_URL
  if (!url.startsWith('https://')) throw new Error('CONVEX_SITE_URL must be HTTPS')
  return url
}
const redactError = (e: unknown, secret: string): string =>
  redactSecrets(e instanceof Error ? e.message : String(e))
    .replaceAll(secret, '[REDACTED]')
    .slice(-800)
const prepareSandboxLayout = async (
  sandbox: Sandbox,
  opts: { agentScript: string; chatId: string; cliScript: string; pgidFile: string; providers: readonly string[] }
): Promise<void> => {
  const killAndMkdir = `pgid=$(cat ${opts.pgidFile} 2>/dev/null); case "$pgid" in '') ;; *[!0-9]*) ;; *) if [ "$pgid" -ge 100 ] 2>/dev/null; then kill -9 -$pgid 2>/dev/null || true; fi ;; esac; rm -f ${opts.pgidFile}; mkdir -p '${WORKSPACE}' '${CLAUDE_SESSIONS_PATH}/${opts.chatId}' '${CLAUDE_TMP_PATH}/${opts.chatId}'; true`
  await Promise.all([
    sandbox.commands.run(killAndMkdir, { timeoutMs: 5000 }),
    sandbox.files.write(AGENT_RUN_PATH, opts.agentScript),
    sandbox.files.write(AGENT_CLI_PATH, opts.cliScript)
  ])
  const cliNames = opts.providers.map(p => p.replace(CLI_PREFIX_RE, '')).filter(n => PROVIDER_NAME_RE.test(n))
  const parts = [
    `chmod +x ${AGENT_CLI_PATH}`,
    `chmod +x ${CLAUDE_CLI_PATH} 2>/dev/null || true`,
    ...cliNames.map(n => `ln -sf ${AGENT_CLI_PATH} '/usr/local/bin/${n}'`)
  ]
  await sandbox.commands.run(parts.join(' && '), { timeoutMs: 5000 })
}
export {
  AGENT_CLI_PATH,
  AGENT_DIR,
  AGENT_RUN_PATH,
  buildSandboxEnv,
  CLAUDE_CLI_PATH,
  prepareSandboxLayout,
  redactError,
  siteUrl,
  WORKSPACE
}
