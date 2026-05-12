import { describe, expect, test } from 'bun:test'
import { assert, constantFrom, domain, emailAddress, property, string, stringMatching, webUrl } from 'fast-check'
import { canonicalizeEmail, validateRedirectTo } from './authHelpers'
const allowedOrigins = new Set(['http://localhost:3000', 'https://app.example.com'])
const primarySite = 'https://app.example.com'
describe('validateRedirectTo — fuzz', () => {
  test('never returns a foreign-origin URL (open-redirect invariant)', () => {
    assert(
      property(string({ maxLength: 200 }), redirectTo => {
        try {
          const out = validateRedirectTo({ allowedOrigins, primarySite, redirectTo })
          const u = new URL(out)
          expect([...allowedOrigins].includes(u.origin.toLowerCase())).toBe(true)
        } catch {
          // Throw is acceptable — proves rejection
        }
      }),
      { numRuns: 1000 }
    )
  })
  test('any URL containing %0d/%0a/%2f%2f/%5c/%09 in path always rejected', () => {
    assert(
      property(
        constantFrom('%0d', '%0a', '%2f%2f', '%5c', '%09'),
        string({ maxLength: 30 }).filter(s => !(s.includes('?') || s.includes('#'))),
        (poison, suffix) => {
          expect(() => validateRedirectTo({ allowedOrigins, primarySite, redirectTo: `/foo${poison}${suffix}` })).toThrow()
        }
      ),
      { numRuns: 200 }
    )
  })
  test(String.raw`any URL starting with // or /\ rejected (protocol-relative)`, () => {
    assert(
      property(constantFrom('//', '/\\'), domain(), (prefix, host) => {
        expect(() => validateRedirectTo({ allowedOrigins, primarySite, redirectTo: `${prefix}${host}/path` })).toThrow()
      }),
      { numRuns: 100 }
    )
  })
  test('any non-allowed http(s) origin rejected', () => {
    assert(
      property(webUrl(), redirectTo => {
        try {
          const u = new URL(redirectTo)
          if (allowedOrigins.has(u.origin.toLowerCase())) return
        } catch {
          return
        }
        expect(() => validateRedirectTo({ allowedOrigins, primarySite, redirectTo })).toThrow()
      }),
      { numRuns: 200 }
    )
  })
})
describe('canonicalizeEmail — fuzz', () => {
  test('idempotent: canonicalize(canonicalize(x)) === canonicalize(x)', () => {
    assert(
      property(emailAddress(), email => {
        const once = canonicalizeEmail(email)
        const twice = canonicalizeEmail(once)
        expect(twice).toBe(once)
      }),
      { numRuns: 500 }
    )
  })
  test('always lowercase', () => {
    assert(
      property(emailAddress(), email => {
        expect(canonicalizeEmail(email)).toBe(canonicalizeEmail(email).toLowerCase())
      }),
      { numRuns: 200 }
    )
  })
  test('gmail.com input never has dots in local part of output', () => {
    assert(
      property(stringMatching(/^[a-z0-9.]{1,20}$/u), local => {
        const out = canonicalizeEmail(`${local}@gmail.com`)
        const localOut = out.split('@')[0] ?? ''
        expect(localOut.includes('.')).toBe(false)
      }),
      { numRuns: 200 }
    )
  })
})
