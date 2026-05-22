/** biome-ignore-all lint/suspicious/noMisplacedAssertion: test-utils wraps expect */
/** biome-ignore-all lint/style/noProcessEnv: test env */
/* eslint-disable func-style, @typescript-eslint/max-params */
import type { TestConvex } from 'convex-test'
import { setHermeticAdapter } from '@a/cli'
import { describe, expect } from 'bun:test'
import type schema from '../convex/schema'
import type { ToolTable, Wrapped } from '../convex/tools/generated/toolCallers'
import { fnByPath } from '../convex/tools/generated/toolCallers'
import { makeTest } from './convex'

type GenericOps = Record<string, { payload: unknown; response: unknown }>
const ADMIN_AUTH = { mode: 'admin', owner: 'test', tier: 'admin' } as const
const USER_AUTH = { mode: 'token', owner: 'test', tier: 'user' } as const
const setApiKey = (key = 'k'): { cleanup: () => void } => {
  const prev = process.env.X_API_KEY
  process.env.X_API_KEY = key
  return {
    cleanup: () => {
      if (prev === undefined) delete process.env.X_API_KEY
      else process.env.X_API_KEY = prev
    }
  }
}
const resetHermetic = (): void => setHermeticAdapter(null)
interface CallOpts {
  path?: string
  tier?: 'admin' | 'user'
  traceId?: string
}
type Envelope<R> = Wrapped<R>
interface ErrShape {
  error: { code: string; details?: Record<string, unknown>; message: string }
  ok: false
}
type T = TestConvex<typeof schema>
const callAsTest = async <K extends keyof ToolTable>(
  t: T,
  path: K,
  args: ToolTable[K]['args'],
  opts: CallOpts = {}
): Promise<Envelope<ToolTable[K]['result']>> => {
  const entry = fnByPath[path]
  if (!entry) throw new Error(`unknown tool path: ${path as string}`)
  const wrapped = {
    ...(args as Record<string, unknown>),
    authCtx: opts.tier === 'user' ? USER_AUTH : ADMIN_AUTH,
    pathCtx: opts.path ?? path,
    traceCtx: opts.traceId ?? 'tr_test'
  }
  type E = Envelope<ToolTable[K]['result']>
  if (entry.kind === 'query') return (await t.query(entry.fn, wrapped)) as E
  if (entry.kind === 'mutation') return (await t.mutation(entry.fn, wrapped)) as E
  return (await t.action(entry.fn, wrapped)) as E
}
type Fixtures<Ops extends GenericOps = GenericOps> = Partial<{
  [K in keyof Ops]: (payload: Ops[K]['payload']) => Ops[K]['response'] | undefined
}>
function expectErr<R>(
  r: Envelope<R>,
  code?: string
): asserts r is ErrShape & { steps: readonly { name: string; tsMs: number }[] } {
  if (r.ok) throw new Error(`expected error, got ok: ${JSON.stringify(r.result)}`)
  if (code !== undefined) expect(r.error.code).toBe(code)
}
function expectOk<R>(
  r: Envelope<R>
): asserts r is { ok: true; result: R; steps: readonly { name: string; tsMs: number }[] } {
  if (!r.ok) throw new Error(`expected ok, got error: ${JSON.stringify(r.error)}`)
}
const callOk = async <K extends keyof ToolTable>(
  path: K,
  args: ToolTable[K]['args'],
  opts?: CallOpts & { t?: T }
): Promise<ToolTable[K]['result']> => {
  const r = await callAsTest(opts?.t ?? makeTest(), path, args, opts)
  expectOk(r)
  return r.result
}
const callErr = async <K extends keyof ToolTable>(
  path: K,
  args: ToolTable[K]['args'],
  code?: string,
  opts?: CallOpts & { t?: T }
): Promise<ErrShape['error']> => {
  const r = await callAsTest(opts?.t ?? makeTest(), path, args, opts)
  expectErr(r, code)
  return r.error
}
interface ToolScope<K extends keyof ToolTable> {
  err: (args: ToolTable[K]['args'], code?: string) => Promise<ErrShape['error']>
  ok: (args: ToolTable[K]['args']) => Promise<ToolTable[K]['result']>
}
const describeTool = <K extends keyof ToolTable>(path: K, fn: (scope: ToolScope<K>) => void): void => {
  describe(path, () => {
    fn({
      err: async (args, code) => callErr(path, args, code),
      ok: async args => callOk(path, args)
    })
  })
}
const setHermetic = <Ops extends GenericOps = GenericOps>(fixtures: Fixtures<Ops>): void => {
  setHermeticAdapter((op, payload) => {
    const fn = (fixtures as Record<string, ((p: unknown) => unknown) | undefined>)[op]
    if (!fn) return
    return fn(payload)
  })
}
export {
  ADMIN_AUTH,
  callAsTest,
  callErr,
  callOk,
  describeTool,
  expectErr,
  expectOk,
  makeTest,
  resetHermetic,
  setApiKey,
  setHermetic,
  USER_AUTH
}
export type { Envelope, Fixtures }
