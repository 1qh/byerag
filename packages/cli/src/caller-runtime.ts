import type { Step } from './builder'
import { ToolError } from './error'
interface Called<T> {
  result: T
  steps: readonly Step[]
}
type Wrapped<T> = WrappedErr | WrappedOk<T>
interface WrappedErr {
  error: { code: string; details?: Record<string, unknown>; message: string }
  ok: false
  steps: readonly Step[]
}
interface WrappedOk<T> {
  ok: true
  result: T
  steps: readonly Step[]
}
const CALLER_AUTH = { mode: 'token' as const, owner: 'caller', tier: 'admin' as const }
const newTrace = (): string => `tr_call_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`
const unwrap = <T>(r: Wrapped<T>): Called<T> => {
  if (r.ok) return { result: r.result, steps: r.steps }
  throw new ToolError(r.error.message, { code: r.error.code, details: r.error.details })
}
const callResult = async <T>(p: Promise<Called<T>>): Promise<T> => {
  const called = await p
  return called.result
}
const wrapArgs = (args: object, path: string): Record<string, unknown> => ({
  ...args,
  authCtx: CALLER_AUTH,
  pathCtx: path,
  traceCtx: newTrace()
})
export { CALLER_AUTH, callResult, newTrace, unwrap, wrapArgs }
export type { Called, Wrapped, WrappedErr, WrappedOk }
