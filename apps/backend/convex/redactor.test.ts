import { describe, expect, test } from 'bun:test'
import { redactSecrets } from './redactor'
const REDACTED = '[REDACTED]'
describe('redactSecrets', () => {
  test('Anthropic sk-ant- key', () => {
    const s = 'auth: sk-ant-api03-abcdefgh1234567890ABCDEF rest of log'
    expect(redactSecrets(s)).toBe(`auth: ${REDACTED} rest of log`)
  })
  test('E2B key', () => {
    const s = 'token=e2b_abc_123_DEFGHI ok'
    expect(redactSecrets(s)).toBe(`token=${REDACTED} ok`)
  })
  test('JWT', () => {
    const s = 'Authorization: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig'
    expect(redactSecrets(s)).toContain(REDACTED)
    expect(redactSecrets(s)).not.toContain('eyJ')
  })
  test('OpenAI-style sk- key', () => {
    const s = 'OPENAI_API_KEY=sk-abc123def456ghi789jklmnop'
    expect(redactSecrets(s)).toBe(`OPENAI_API_KEY=${REDACTED}`)
  })
  test('AWS access key id', () => {
    const s = 'access_key=AKIAIOSFODNN7EXAMPLE other'
    expect(redactSecrets(s)).toBe(`access_key=${REDACTED} other`)
  })
  test('GitHub personal access token (ghp_)', () => {
    const s = 'token=ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA done'
    expect(redactSecrets(s)).toBe(`token=${REDACTED} done`)
  })
  test('GitHub OAuth token (gho_)', () => {
    const s = 'gho_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'
    expect(redactSecrets(s)).toBe(REDACTED)
  })
  test('Google API key (AIza)', () => {
    const s = 'GOOGLE_API_KEY=AIzaSyA-1234567890ABCDEFGHIJKLMNOPQRSTU'
    expect(redactSecrets(s)).toBe(`GOOGLE_API_KEY=${REDACTED}`)
  })
  test('redacts multiple secrets in one string', () => {
    const s = 'sk-ant-aaaa1111bbbb and eyJabc123def456ghi789jkl'
    const out = redactSecrets(s)
    expect(out.match(/\[REDACTED\]/gu)?.length).toBe(2)
    expect(out).not.toContain('sk-ant-')
    expect(out).not.toContain('eyJ')
  })
  test('does NOT redact non-secret-looking strings', () => {
    const s = 'normal log line about API requests with no keys'
    expect(redactSecrets(s)).toBe(s)
  })
  test('does NOT redact short sk- (length below threshold)', () => {
    const s = 'sk-tooShort'
    expect(redactSecrets(s)).toBe(s)
  })
  test('does NOT redact AKIA prefix without 16 trailing alphanumerics', () => {
    const s = 'AKIA12345 too short'
    expect(redactSecrets(s)).toBe(s)
  })
  test('does NOT redact AIza without exactly 35 trailing chars', () => {
    const s = 'AIzaTooShort and AIzaWaytooLongtoBeARealkeyandShouldNotMatchEither'
    expect(redactSecrets(s)).toBe(s)
  })
  test('case-insensitive sk-ant variants caught', () => {
    const s = 'SK-ANT-api03-abcdefgh12345678'
    expect(redactSecrets(s)).toBe(REDACTED)
  })
  test('preserves surrounding whitespace and punctuation', () => {
    const s = '{"key": "sk-ant-abc12345defgh"}'
    expect(redactSecrets(s)).toBe(`{"key": "${REDACTED}"}`)
  })
  test('handles empty string', () => {
    expect(redactSecrets('')).toBe('')
  })
  test('handles string with only secret', () => {
    expect(redactSecrets('sk-ant-abc12345')).toBe(REDACTED)
  })
})
