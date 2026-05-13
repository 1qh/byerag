/* eslint-disable no-script-url */
/* oxlint-disable eslint(no-script-url) */
import { describe, expect, test } from 'bun:test'
import { canonicalizeEmail, parseAllowed, parseSiteUrls, validateProfileEmail, validateRedirectTo } from './authHelpers'
describe('canonicalizeEmail', () => {
  test('lowercases', () => {
    expect(canonicalizeEmail('Foo@Example.COM')).toBe('foo@example.com')
  })
  test('strips +tag', () => {
    expect(canonicalizeEmail('user+tag@example.com')).toBe('user@example.com')
  })
  test('strips dots in gmail.com', () => {
    expect(canonicalizeEmail('f.o.o@gmail.com')).toBe('foo@gmail.com')
  })
  test('strips dots in googlemail.com', () => {
    expect(canonicalizeEmail('a.b@googlemail.com')).toBe('ab@googlemail.com')
  })
  test('keeps dots for non-gmail', () => {
    expect(canonicalizeEmail('a.b@yahoo.com')).toBe('a.b@yahoo.com')
  })
  test('returns input unchanged when no @', () => {
    expect(canonicalizeEmail('notanemail')).toBe('notanemail')
  })
})
describe('parseAllowed (used for BOOTSTRAP_ADMIN_EMAIL CSV)', () => {
  test('parses CSV and canonicalizes', () => {
    const s = parseAllowed('a.b@gmail.com, User+x@Example.com')
    expect(s.has('ab@gmail.com')).toBe(true)
    expect(s.has('user@example.com')).toBe(true)
  })
  test('empty input → empty set', () => {
    expect(parseAllowed(undefined).size).toBe(0)
    expect(parseAllowed('').size).toBe(0)
  })
})
describe('parseSiteUrls', () => {
  test('multi-origin CSV → all origins normalized', () => {
    const r = parseSiteUrls('https://app.example.com,http://localhost:3000,http://127.0.0.1:3000')
    expect(r.allowedOrigins.has('https://app.example.com')).toBe(true)
    expect(r.allowedOrigins.has('http://localhost:3000')).toBe(true)
    expect(r.allowedOrigins.has('http://127.0.0.1:3000')).toBe(true)
    expect(r.primary).toBe('https://app.example.com')
  })
  test('single URL', () => {
    const r = parseSiteUrls('https://example.com')
    expect(r.primary).toBe('https://example.com')
    expect(r.allowedOrigins.size).toBe(1)
  })
  test('empty', () => {
    const r = parseSiteUrls(undefined)
    expect(r.primary).toBe('')
    expect(r.allowedOrigins.size).toBe(0)
  })
  test('garbage entries dropped from origins', () => {
    const r = parseSiteUrls('https://ok.com,not-a-url')
    expect(r.allowedOrigins.has('https://ok.com')).toBe(true)
    expect(r.allowedOrigins.size).toBe(1)
  })
})
describe('validateProfileEmail', () => {
  test('accepts email with email_verified=true', () => {
    expect(
      validateProfileEmail({ existingEmail: null, profile: { email: 'user@example.com', email_verified: true } })
        .canonicalEmail
    ).toBe('user@example.com')
  })
  test('accepts email when email_verified is undefined (Google self-hosted profile)', () => {
    expect(validateProfileEmail({ existingEmail: null, profile: { email: 'user@example.com' } }).canonicalEmail).toBe(
      'user@example.com'
    )
  })
  test('rejects email_verified === false', () => {
    expect(() =>
      validateProfileEmail({ existingEmail: null, profile: { email: 'user@example.com', email_verified: false } })
    ).toThrow('Email not verified by provider')
  })
  test('rejects when email missing', () => {
    expect(() => validateProfileEmail({ existingEmail: null, profile: {} })).toThrow('Email missing or invalid')
  })
  test('canonicalizes — gmail dots strip', () => {
    expect(validateProfileEmail({ existingEmail: null, profile: { email: 'a.b@gmail.com' } }).canonicalEmail).toBe(
      'ab@gmail.com'
    )
  })
  test('rejects existing-user email mismatch', () => {
    expect(() =>
      validateProfileEmail({ existingEmail: 'other@example.com', profile: { email: 'user@example.com' } })
    ).toThrow('Email mismatch')
  })
  test('accepts existing-user with matching email', () => {
    expect(
      validateProfileEmail({ existingEmail: 'user@example.com', profile: { email: 'user@example.com' } }).canonicalEmail
    ).toBe('user@example.com')
  })
})
describe('validateRedirectTo — open-redirect defense', () => {
  const allowedOrigins = new Set(['http://localhost:3000', 'https://app.example.com'])
  const primarySite = 'https://app.example.com'
  const opts = (redirectTo: unknown) => ({ allowedOrigins, primarySite, redirectTo })
  test('relative path → primary site + path', () => {
    expect(validateRedirectTo(opts('/chat/abc'))).toBe('https://app.example.com/chat/abc')
  })
  test('absolute URL with allowed origin', () => {
    expect(validateRedirectTo(opts('http://localhost:3000/foo?x=1'))).toBe('http://localhost:3000/foo?x=1')
  })
  test('absolute URL with foreign origin rejected', () => {
    expect(() => validateRedirectTo(opts('https://evil.com/'))).toThrow('redirectTo origin not allowed')
  })
  test('protocol-relative // rejected', () => {
    expect(() => validateRedirectTo(opts('//evil.com/path'))).toThrow('protocol-relative')
  })
  test(String.raw`/\\ payload rejected (encoded backslash check fires first)`, () => {
    expect(() => validateRedirectTo(opts(String.raw`/\evil.com`))).toThrow()
  })
  test('encoded backslash %5c rejected', () => {
    expect(() => validateRedirectTo(opts('/foo%5cbar'))).toThrow('disallowed encoded chars')
  })
  test('encoded // %2f%2f rejected', () => {
    expect(() => validateRedirectTo(opts('/foo%2f%2fevil.com'))).toThrow('disallowed encoded chars')
  })
  test('CRLF tab encoded chars rejected', () => {
    expect(() => validateRedirectTo(opts('/foo%0d%0aSet-Cookie:%20x'))).toThrow('disallowed encoded chars')
    expect(() => validateRedirectTo(opts('/foo%09bar'))).toThrow('disallowed encoded chars')
  })
  test('non-string redirectTo rejected', () => {
    expect(() => validateRedirectTo(opts(123))).toThrow('Expected string redirectTo')
    expect(() => validateRedirectTo(opts(null))).toThrow('Expected string redirectTo')
  })
  test('malformed URL rejected', () => {
    expect(() => validateRedirectTo(opts('http://[invalid'))).toThrow('Invalid redirectTo URL')
  })
  test('javascript: URL rejected (origin not in allowlist)', () => {
    expect(() => validateRedirectTo(opts('javascript:alert(1)'))).toThrow()
  })
})
