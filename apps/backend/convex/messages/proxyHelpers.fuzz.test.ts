import { describe, expect, test } from 'bun:test'
import { assert, integer, property, string, stringMatching, uuid } from 'fast-check'
import { parseProxyToken } from './proxyHelpers'

const validChatId = stringMatching(/^[a-z0-9]{24,64}$/u)
const validUuid = uuid()
describe('parseProxyToken — fuzz', () => {
  test('never throws — always returns null or { chatId, secret }', () => {
    assert(
      property(string(), token => {
        const r = parseProxyToken(token)
        if (r !== null) {
          expect(typeof r.chatId).toBe('string')
          expect(typeof r.secret).toBe('string')
        }
      }),
      { numRuns: 500 }
    )
  })
  test('rejects legacy proxy:<chatId>:<uuid> shape (only sk-ant-oat01-proxy_ accepted now)', () => {
    assert(
      property(validChatId, validUuid, (chatId, secret) => {
        expect(parseProxyToken(`proxy:${chatId}:${secret}`)).toBeNull()
      }),
      { numRuns: 200 }
    )
  })
  test('sk-ant-oat01-proxy_<chatId>_<noDashUuid> roundtrips', () => {
    assert(
      property(validChatId, validUuid, (chatId, secret) => {
        const noDashes = secret.replaceAll('-', '')
        expect(parseProxyToken(`sk-ant-oat01-proxy_${chatId}_${noDashes}`)).toEqual({ chatId, secret })
      }),
      { numRuns: 200 }
    )
  })
  test('rejects tokens longer than 256 chars', () => {
    assert(
      property(string({ maxLength: 1000, minLength: 257 }), token => {
        expect(parseProxyToken(token)).toBeNull()
      }),
      { numRuns: 100 }
    )
  })
  test('rejects tampered uuid (any single hex char flip breaks parse)', () => {
    assert(
      property(validChatId, validUuid, integer({ max: 35, min: 0 }), (chatId, secret, idx) => {
        const noDashes = secret.replaceAll('-', '')
        const flipped = `${noDashes.slice(0, idx)}${noDashes[idx] === 'z' ? 'a' : 'z'}${noDashes.slice(idx + 1)}`
        const token = `sk-ant-oat01-proxy_${chatId}_${flipped}`
        const r = parseProxyToken(token)
        if (r !== null) expect(r.secret).not.toBe(secret)
      }),
      { numRuns: 200 }
    )
  })
})
