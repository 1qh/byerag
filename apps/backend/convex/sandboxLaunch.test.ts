import { describe, expect, test } from 'bun:test'
import { buildSandboxEnv } from './sandboxLaunch'

const baseInput = {
  appId: 'test',
  chatId: 'k57abc',
  convexSiteUrl: 'https://site.example.com',
  effort: 'medium',
  maxBudgetUsd: '0.5',
  maxTurns: '20',
  model: 'claude-haiku-4-5',
  pgidFile: '/tmp/pgid-1',
  resumeSessionId: '',
  secret: '01234567-89ab-cdef-0123-456789abcdef',
  systemPrompt: 'sys',
  userText: 'hello'
}
describe('buildSandboxEnv', () => {
  test('does NOT set ANTHROPIC_AUTH_TOKEN/CLAUDE_CODE_OAUTH_TOKEN (run.ts injects SDK-valid bearer post-sanitize)', () => {
    const env = buildSandboxEnv(baseInput)
    expect(env).not.toHaveProperty('ANTHROPIC_AUTH_TOKEN')
    expect(env).not.toHaveProperty('CLAUDE_CODE_OAUTH_TOKEN')
  })
  test('points ANTHROPIC_BASE_URL at convexSiteUrl/api/anthropic', () => {
    expect(buildSandboxEnv(baseInput).ANTHROPIC_BASE_URL).toBe('https://site.example.com/api/anthropic')
  })
  test('passes chatId + secret as both CHAT_* and CLI_SESSION_*', () => {
    const env = buildSandboxEnv(baseInput)
    expect(env.CHAT_ID).toBe(baseInput.chatId)
    expect(env.CHAT_SECRET).toBe(baseInput.secret)
    expect(env.CLI_SESSION_ID).toBe(baseInput.chatId)
    expect(env.CLI_SESSION_SECRET).toBe(baseInput.secret)
  })
  test('config dirs are namespaced by chatId (no cross-chat leak)', () => {
    const env = buildSandboxEnv(baseInput)
    expect(env.CLAUDE_CONFIG_DIR.endsWith(`/${baseInput.chatId}`)).toBe(true)
    expect(env.CLAUDE_TMPDIR.endsWith(`/${baseInput.chatId}`)).toBe(true)
    expect(env.CLAUDE_CODE_REMOTE_MEMORY_DIR.endsWith(`/${baseInput.chatId}`)).toBe(true)
  })
  test('PATH resolves bun and claude ahead of the system dirs', () => {
    const env = buildSandboxEnv(baseInput)
    const entries = env.PATH.split(':')
    const bunBin = entries.indexOf('/home/agent/.bun/bin')
    const agentBin = entries.indexOf('/home/agent/node_modules/.bin')
    const systemBin = entries.indexOf('/usr/bin')
    expect(bunBin).toBeGreaterThanOrEqual(0)
    expect(agentBin).toBeGreaterThanOrEqual(0)
    expect(bunBin).toBeLessThan(systemBin)
    expect(agentBin).toBeLessThan(systemBin)
    expect(env.PATH).toContain('/usr/local/bin')
  })
  test('forwards budget/turns/model/effort/system/user verbatim', () => {
    const env = buildSandboxEnv(baseInput)
    expect(env.MAX_BUDGET_USD).toBe(baseInput.maxBudgetUsd)
    expect(env.MAX_TURNS).toBe(baseInput.maxTurns)
    expect(env.MODEL).toBe(baseInput.model)
    expect(env.EFFORT).toBe(baseInput.effort)
    expect(env.SYSTEM_PROMPT).toBe(baseInput.systemPrompt)
    expect(env.USER_TEXT).toBe(baseInput.userText)
  })
  test('does NOT leak any other env keys (closed surface)', () => {
    const expectedKeys = new Set([
      'ANTHROPIC_BASE_URL',
      'CHAT_APP',
      'CHAT_ID',
      'CHAT_SECRET',
      'CLAUDE_CODE_REMOTE_MEMORY_DIR',
      'CLAUDE_CONFIG_DIR',
      'CLAUDE_TMPDIR',
      'CLI_SESSION_ID',
      'CLI_SESSION_SECRET',
      'CONVEX_SITE_URL',
      'EFFORT',
      'HOME',
      'MAX_BUDGET_USD',
      'MAX_TURNS',
      'MODEL',
      'PATH',
      'PGID_FILE',
      'RESUME_SESSION_ID',
      'SYSTEM_PROMPT',
      'USER_TEXT'
    ])
    const actualKeys = new Set(Object.keys(buildSandboxEnv(baseInput)))
    expect(actualKeys).toEqual(expectedKeys)
  })
})
