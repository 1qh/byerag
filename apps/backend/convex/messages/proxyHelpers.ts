import { VALID_CHATID_RE as CHATID_SHAPE_RE } from '../constants'

const OAUTH_FAKE_PREFIX = 'sk-ant-oat01-proxy_'
const MAX_PROXY_TOKEN_LEN = 256
const BEARER_RE = /^Bearer\s+/iu
const NODASH_UUID_RE = /^[a-f0-9]{32}$/u
const ANTHROPIC_PREFIX_RE = /^\/api\/anthropic/u
const SKIP_REQ_HEADERS = new Set(['authorization', 'content-length', 'host', 'x-api-key'])
const SKIP_RES_HEADERS = new Set(['content-encoding', 'transfer-encoding'])
const ALLOW_RES_HEADERS = new Set([
  'anthropic-ratelimit-input-tokens-limit',
  'anthropic-ratelimit-input-tokens-remaining',
  'anthropic-ratelimit-input-tokens-reset',
  'anthropic-ratelimit-output-tokens-limit',
  'anthropic-ratelimit-output-tokens-remaining',
  'anthropic-ratelimit-output-tokens-reset',
  'anthropic-ratelimit-requests-limit',
  'anthropic-ratelimit-requests-remaining',
  'anthropic-ratelimit-requests-reset',
  'anthropic-ratelimit-tokens-limit',
  'anthropic-ratelimit-tokens-remaining',
  'anthropic-ratelimit-tokens-reset',
  'cache-control',
  'content-length',
  'content-type',
  'retry-after'
])
const MAX_PROXY_BODY = 1_000_000
const restoreUuid = (s: string): null | string => {
  if (!NODASH_UUID_RE.test(s)) return null
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`
}
const parseProxyToken = (token: string): null | { chatId: string; secret: string } => {
  if (token.length > MAX_PROXY_TOKEN_LEN) return null
  if (!token.startsWith(OAUTH_FAKE_PREFIX)) return null
  const rest = token.slice(OAUTH_FAKE_PREFIX.length)
  const sep = rest.lastIndexOf('_')
  if (sep < 1) return null
  const chatId = rest.slice(0, sep)
  const secret = restoreUuid(rest.slice(sep + 1))
  if (!(secret && CHATID_SHAPE_RE.test(chatId))) return null
  return { chatId, secret }
}
export {
  ALLOW_RES_HEADERS,
  ANTHROPIC_PREFIX_RE,
  BEARER_RE,
  MAX_PROXY_BODY,
  parseProxyToken,
  SKIP_REQ_HEADERS,
  SKIP_RES_HEADERS
}
