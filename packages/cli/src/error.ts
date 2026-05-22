import type { DispatchError, ErrorCategory } from './types'

interface ToolErrorOpts {
  cause?: unknown
  code: string
  details?: Record<string, unknown>
}
const cat = new Map<string, ErrorCategory>([
  ['AMBIGUOUS_COUNTRY', 'input'],
  ['BUSY', 'transient'],
  ['CONTEXT_STOLEN', 'auth'],
  ['EXTRACT_EXPIRED', 'permanent'],
  ['EXTRACT_NOT_FOUND', 'permanent'],
  ['FETCH_FAILED', 'upstream'],
  ['FORBIDDEN', 'auth'],
  ['INTERNAL_ERROR', 'permanent'],
  ['INVALID_ARG', 'input'],
  ['NOT_FOUND', 'input'],
  ['PROVIDER_DEGRADED', 'transient'],
  ['PROVIDER_DISABLED', 'permanent'],
  ['RATE_LIMITED', 'transient'],
  ['UNAUTHORIZED', 'auth'],
  ['UPSTREAM_ERROR', 'upstream']
])
type KnownErrorCode =
  | 'AMBIGUOUS_COUNTRY'
  | 'BUSY'
  | 'CONTEXT_STOLEN'
  | 'EXTRACT_EXPIRED'
  | 'EXTRACT_NOT_FOUND'
  | 'FETCH_FAILED'
  | 'FORBIDDEN'
  | 'INTERNAL_ERROR'
  | 'INVALID_ARG'
  | 'NOT_FOUND'
  | 'PROVIDER_DEGRADED'
  | 'PROVIDER_DISABLED'
  | 'RATE_LIMITED'
  | 'UNAUTHORIZED'
  | 'UPSTREAM_ERROR'
const retry: Record<ErrorCategory, boolean> = {
  auth: false,
  input: false,
  permanent: false,
  transient: true,
  upstream: true
}
const makeError = (opts: { code: string; details?: Record<string, unknown>; message: string }): DispatchError => {
  const category = cat.get(opts.code) ?? 'permanent'
  return { category, code: opts.code, details: opts.details, message: opts.message, retryable: retry[category] }
}
class ToolError extends Error {
  public readonly code: string
  public readonly details?: Record<string, unknown>
  public constructor(message: string, opts: ToolErrorOpts) {
    super(message, opts.cause === undefined ? undefined : { cause: opts.cause })
    this.code = opts.code
    this.details = opts.details
    this.name = 'ToolError'
  }
}
const toDispatchError = (e: unknown): DispatchError => {
  if (e instanceof ToolError) return makeError({ code: e.code, details: e.details, message: e.message })
  if (e instanceof Error) return makeError({ code: 'INTERNAL_ERROR', message: e.message })
  return makeError({ code: 'INTERNAL_ERROR', message: String(e) })
}
export { makeError, toDispatchError, ToolError }
export type { KnownErrorCode }
