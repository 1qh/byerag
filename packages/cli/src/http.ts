import type { KnownErrorCode } from './error'
import { makeError } from './error'
const KEBAB_RE = /^[a-z][a-z0-9-]*$/u
const kebabToSnake = (s: string): string => s.replaceAll('-', '_')
const jsonRes = (status: number, body: unknown): Response =>
  Response.json(body, { headers: { 'Content-Type': 'application/json' }, status })
const errorRes = (opts: {
  code: KnownErrorCode
  details?: Record<string, unknown>
  message: string
  status: number
}): Response =>
  jsonRes(opts.status, { error: makeError({ code: opts.code, details: opts.details, message: opts.message }) })
const newTraceId = (): string => `tr_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`
const parsePath = (raw: unknown): Response | string[] => {
  if (!Array.isArray(raw) || raw.length < 2)
    return errorRes({ code: 'INVALID_ARG', message: 'path must be array of at least 2 segments', status: 400 })
  const path: string[] = []
  for (const seg of raw) {
    const s = String(seg)
    if (!KEBAB_RE.test(s))
      return errorRes({
        code: 'INVALID_ARG',
        details: { offending: s },
        message: `invalid path segment: ${s.slice(0, 30)}`,
        status: 400
      })
    path.push(s)
  }
  return path
}
const snakeArgs = (args: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {}
  for (const [k, val] of Object.entries(args)) out[kebabToSnake(k)] = val
  return out
}
export { errorRes, jsonRes, KEBAB_RE, kebabToSnake, newTraceId, parsePath, snakeArgs }
