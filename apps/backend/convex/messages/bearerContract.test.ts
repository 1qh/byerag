import { describe, expect, test } from 'bun:test'
import { parseProxyToken } from './proxyHelpers'

const VALID_CHATID = 'abcdefghijklmnopqrstuvwx'
const VALID_SECRET = '01234567-89ab-cdef-0123-456789abcdef'
const buildRunOauthBearer = (chatId: string, secret: string): string =>
  `sk-ant-oat01-proxy_${chatId}_${secret.replaceAll('-', '')}`
describe('bearer ↔ parser round-trip', () => {
  test('sandbox/run.ts sk-ant-oat01-proxy_ shape parses', () => {
    const token = buildRunOauthBearer(VALID_CHATID, VALID_SECRET)
    expect(parseProxyToken(token)).toEqual({ chatId: VALID_CHATID, secret: VALID_SECRET })
  })
  test('rejects bare sk-ant-oat (real OAuth token, no proxy_ infix)', () => {
    expect(parseProxyToken('sk-ant-oat01-realtokenwithoutproxyinfix')).toBeNull()
  })
  test('rejects legacy proxy:<chatId>:<secret> shape (only sk-ant-oat01-proxy_ accepted)', () => {
    expect(parseProxyToken(`proxy:${VALID_CHATID}:${VALID_SECRET}`)).toBeNull()
  })
  test('rejects oauth-shape with bad uuid', () => {
    expect(parseProxyToken(`sk-ant-oat01-proxy_${VALID_CHATID}_notahex`)).toBeNull()
  })
  test('rejects oauth-shape with chatid too short', () => {
    expect(parseProxyToken(`sk-ant-oat01-proxy_short_${VALID_SECRET.replaceAll('-', '')}`)).toBeNull()
  })
})
