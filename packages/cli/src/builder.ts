/* oxlint-disable unicorn/consistent-function-scoping -- generic-typed factory chains: inner arrow fns carry type-parameter context erased at runtime */
import type { Infer, PropertyValidators, Validator } from 'convex/values'
import { v } from 'convex/values'
import type { ArgSpec, ArgSpecs, CostClass, ToolMeta } from './types'
import { toDispatchError, ToolError } from './error'

interface ArgStringFn {
  <const A extends readonly string[] = readonly []>(
    opts: StringOptsBase<A> & { optional?: false }
  ): ArgSpec<ReturnType<typeof v.string>, false, A>
  <const A extends readonly string[] = readonly []>(
    opts: StringOptsBase<A> & { optional: true }
  ): ArgSpec<ReturnType<typeof v.string>, true, A>
}
interface StringOptsBase<A extends readonly string[]> {
  aliases?: A
  default?: string
  description: string
  maxLength?: number
  minLength?: number
  pattern?: string
}
const argStringImpl = <const A extends readonly string[] = readonly []>(
  opts: StringOptsBase<A> & { optional?: boolean }
): ArgSpec<ReturnType<typeof v.string>, boolean, A> => ({
  aliases: opts.aliases,
  description: opts.description,
  kind: 'string',
  maxLength: opts.maxLength,
  minLength: opts.minLength,
  optional: opts.optional ?? false,
  pattern: opts.pattern,
  required: !(opts.optional ?? false),
  v: v.string()
})
const argString = argStringImpl as ArgStringFn
interface ArgNumberFn {
  <const A extends readonly string[] = readonly []>(
    opts: NumberOptsBase<A> & { optional?: false }
  ): ArgSpec<ReturnType<typeof v.float64>, false, A>
  <const A extends readonly string[] = readonly []>(
    opts: NumberOptsBase<A> & { optional: true }
  ): ArgSpec<ReturnType<typeof v.float64>, true, A>
}
interface NumberOptsBase<A extends readonly string[]> {
  aliases?: A
  default?: number
  description: string
  integer?: boolean
  max?: number
  min?: number
}
const argNumberImpl = <const A extends readonly string[] = readonly []>(
  opts: NumberOptsBase<A> & { optional?: boolean }
): ArgSpec<ReturnType<typeof v.float64>, boolean, A> => ({
  aliases: opts.aliases,
  description: opts.description,
  integer: opts.integer,
  kind: 'number',
  max: opts.max,
  min: opts.min,
  optional: opts.optional ?? false,
  required: !(opts.optional ?? false),
  v: v.float64()
})
const argNumber = argNumberImpl as ArgNumberFn
interface ArgBoolFn {
  <const A extends readonly string[] = readonly []>(opts: {
    aliases?: A
    description: string
    optional?: false
  }): ArgSpec<ReturnType<typeof v.boolean>, false, A>
  <const A extends readonly string[] = readonly []>(opts: {
    aliases?: A
    description: string
    optional: true
  }): ArgSpec<ReturnType<typeof v.boolean>, true, A>
}
const argBoolImpl = <const A extends readonly string[] = readonly []>(opts: {
  aliases?: A
  description: string
  optional?: boolean
}): ArgSpec<ReturnType<typeof v.boolean>, boolean, A> => ({
  aliases: opts.aliases,
  description: opts.description,
  kind: 'bool',
  optional: opts.optional ?? false,
  required: !(opts.optional ?? false),
  v: v.boolean()
})
const argBool = argBoolImpl as ArgBoolFn
interface ArgEnumFn {
  <const Vals extends readonly [string, ...string[]], const A extends readonly string[] = readonly []>(
    values: Vals,
    opts: { aliases?: A; default?: Vals[number]; description: string; optional?: false }
  ): ArgSpec<Validator<Vals[number]>, false, A>
  <const Vals extends readonly [string, ...string[]], const A extends readonly string[] = readonly []>(
    values: Vals,
    opts: { aliases?: A; default?: Vals[number]; description: string; optional: true }
  ): ArgSpec<Validator<Vals[number]>, true, A>
}
const argEnumImpl = <const Vals extends readonly [string, ...string[]], const A extends readonly string[] = readonly []>(
  values: Vals,
  opts: { aliases?: A; default?: Vals[number]; description: string; optional?: boolean }
): ArgSpec<Validator<Vals[number]>, boolean, A> => {
  const lits = values.map(vv => v.literal(vv)) as [ReturnType<typeof v.literal>, ...ReturnType<typeof v.literal>[]]
  const union = v.union(...lits) as unknown as Validator<Vals[number]>
  return {
    aliases: opts.aliases,
    description: opts.description,
    enum: values,
    kind: 'enum',
    optional: opts.optional ?? false,
    required: !(opts.optional ?? false),
    v: union
  }
}
const argEnum = argEnumImpl as ArgEnumFn
const arg = { bool: argBool, enum: argEnum, number: argNumber, string: argString }
type ArgValue<A> = A extends ArgSpec<infer V, infer Opt> ? (Opt extends true ? Infer<V> | undefined : Infer<V>) : never
type CachedFn<Args extends ArgSpecs> = <T>(args: HandlerArgs<Args>, compute: () => Promise<T>) => Promise<T>
type FailArg<Codes extends readonly string[]> = (
  code: Codes[number],
  message: string,
  details?: Record<string, unknown>
) => never
type FailFn<Codes extends readonly string[]> = ((
  code: Codes[number],
  message: string,
  details?: Record<string, unknown>
) => never) & { codes: Codes }
type HandlerArgs<Args extends ArgSpecs> = { [K in keyof Args]: ArgValue<Args[K]> }
/* oxlint-disable-next-line unicorn/consistent-function-scoping -- generic-typed factory: inner fn carries Codes[number] type erased at runtime */
const makeFailInner = (code: string, message: string, details?: Record<string, unknown>): never => {
  throw new ToolError(message, { code, details })
}
const makeFail = <const Codes extends readonly string[]>(...codes: Codes): FailFn<Codes> => {
  const fn = makeFailInner as (code: Codes[number], message: string, details?: Record<string, unknown>) => never
  return Object.assign(fn, { codes })
}
interface ActionCtxExtras<Args extends ArgSpecs, Codes extends readonly string[], TAuth>
  extends ReadCtxExtras<Codes, TAuth> {
  cached: CachedFn<Args>
}
interface CommonOpts<Args extends ArgSpecs, Codes extends readonly string[]> {
  args: Args
  cost?: CostClass
  deprecated?: null | { message: string; replacedBy: string }
  description?: string
  deterministic?: boolean
  errorCodes?: Codes
  examples?: readonly string[]
  exclusive?: readonly (keyof Args & string)[] | readonly (readonly (keyof Args & string)[])[]
  selfTest?: Partial<HandlerArgs<Args>>
  version?: string
}
interface ReadCtxExtras<Codes extends readonly string[], TAuth> {
  auth: TAuth
  chatId: string | undefined
  fail: FailArg<Codes>
  mergeSteps: (prefix: string, substeps: readonly Step[]) => void
  step: (name: string, details?: Record<string, unknown>) => void
  toolPath: string
  traceId: string
}
interface Step {
  details?: Record<string, unknown>
  name: string
  tsMs: number
}
interface StepSink {
  mergeSteps: (prefix: string, substeps: readonly Step[]) => void
  step: (name: string, details?: Record<string, unknown>) => void
  steps: Step[]
}
const createStepSink = (): StepSink => {
  const steps: Step[] = []
  return {
    mergeSteps: (prefix, substeps) => {
      for (const s of substeps) steps.push({ details: s.details, name: `${prefix}${s.name}`, tsMs: s.tsMs })
    },
    step: (name, details) => {
      steps.push({ details, name, tsMs: Date.now() })
    },
    steps
  }
}
const AUTH_KEY = 'authCtx'
const TRACE_KEY = 'traceCtx'
const PATH_KEY = 'pathCtx'
const CHAT_KEY = 'chatCtx'
const normalizeExclusive = (exc: CommonOpts<ArgSpecs, readonly string[]>['exclusive']): readonly (readonly string[])[] => {
  if (!exc || exc.length === 0) return []
  return typeof exc[0] === 'string' ? [exc as readonly string[]] : (exc as readonly (readonly string[])[])
}
const buildMeta = <Args extends ArgSpecs, Codes extends readonly string[]>(
  def: CommonOpts<Args, Codes> & { fail?: FailFn<Codes> }
): ToolMeta => ({
  cost: def.cost ?? 'medium',
  deprecated: def.deprecated ?? null,
  description: def.description ?? '',
  deterministic: def.deterministic ?? false,
  errorCodes: def.errorCodes ?? def.fail?.codes ?? [],
  examples: def.examples ?? [],
  exclusive: normalizeExclusive(def.exclusive),
  selfTest: def.selfTest ?? {},
  version: def.version ?? '1'
})
type WrappedResult =
  | { error: ReturnType<typeof toDispatchError>; ok: false; steps: readonly Step[] }
  | { ok: true; result: unknown; steps: readonly Step[] }
const unpack = (
  raw: unknown
): {
  args: Record<string, unknown>
  authCtx: unknown
  chatCtx: unknown
  pathCtx: unknown
  traceCtx: unknown
} => {
  const {
    [AUTH_KEY]: authCtx,
    [CHAT_KEY]: chatCtx,
    [PATH_KEY]: pathCtx,
    [TRACE_KEY]: traceCtx,
    ...args
  } = raw as Record<string, unknown>
  return { args, authCtx, chatCtx, pathCtx, traceCtx }
}
interface BuilderDeps<TAuth, TActionCtx, TQueryCtx, TMutationCtx, TAct, TQry, TMut> {
  authValidator: Validator<TAuth, 'required', string>
  cached: (opts: CacheOpts<TActionCtx, TAuth>) => Promise<unknown>
  internalAction: (def: { args: PropertyValidators; handler: (ctx: TActionCtx, raw: unknown) => Promise<unknown> }) => TAct
  internalMutation: (def: {
    args: PropertyValidators
    handler: (ctx: TMutationCtx, raw: unknown) => Promise<unknown>
  }) => TMut
  internalQuery: (def: { args: PropertyValidators; handler: (ctx: TQueryCtx, raw: unknown) => Promise<unknown> }) => TQry
}
interface CacheOpts<TActionCtx, TAuth> {
  args: unknown
  auth: TAuth
  compute: () => Promise<unknown>
  ctx: TActionCtx
  toolPath: string
}
interface DefineMutationOpts<Args extends ArgSpecs, Codes extends readonly string[], TMutationCtx, TAuth>
  extends CommonOpts<Args, Codes> {
  fail?: FailFn<Codes>
  handler: (ctx: ReadCtxExtras<Codes, TAuth> & TMutationCtx, args: HandlerArgs<Args>) => Promise<unknown>
}
interface DefineQueryOpts<Args extends ArgSpecs, Codes extends readonly string[], TQueryCtx, TAuth>
  extends CommonOpts<Args, Codes> {
  fail?: FailFn<Codes>
  handler: (ctx: ReadCtxExtras<Codes, TAuth> & TQueryCtx, args: HandlerArgs<Args>) => Promise<unknown>
}
interface DefineToolOpts<Args extends ArgSpecs, Codes extends readonly string[], TActionCtx, TAuth>
  extends CommonOpts<Args, Codes> {
  fail?: FailFn<Codes>
  handler: (ctx: ActionCtxExtras<Args, Codes, TAuth> & TActionCtx, args: HandlerArgs<Args>) => Promise<unknown>
}
const createBuilder = <TAuth, TActionCtx, TQueryCtx, TMutationCtx, TAct, TQry, TMut>(
  deps: BuilderDeps<TAuth, TActionCtx, TQueryCtx, TMutationCtx, TAct, TQry, TMut>
) => {
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- captures deps.authValidator closure
  const buildFullArgs = (argSpecs: ArgSpecs): PropertyValidators => {
    const convexArgs: PropertyValidators = {}
    for (const [k, spec] of Object.entries(argSpecs)) convexArgs[k] = spec.required === false ? v.optional(spec.v) : spec.v
    return {
      ...convexArgs,
      [AUTH_KEY]: deps.authValidator,
      [CHAT_KEY]: v.optional(v.string()),
      [PATH_KEY]: v.string(),
      [TRACE_KEY]: v.string()
    }
  }
  const defaultFail: FailArg<readonly string[]> = (code, message, details) => {
    throw new ToolError(message, { code, details })
  }
  interface BaseExtrasOpts<Codes extends readonly string[]> {
    authCtx: unknown
    chatCtx: unknown
    pathCtx: unknown
    providedFail: FailFn<Codes> | undefined
    traceCtx: unknown
  }
  const baseExtras = <Codes extends readonly string[]>({
    authCtx,
    chatCtx,
    pathCtx,
    traceCtx,
    providedFail
  }: BaseExtrasOpts<Codes>): { ctx: ReadCtxExtras<Codes, TAuth>; steps: Step[] } => {
    const fail = providedFail ?? (defaultFail as FailArg<Codes>)
    const sink = createStepSink()
    return {
      ctx: {
        auth: authCtx as TAuth,
        chatId: typeof chatCtx === 'string' ? chatCtx : undefined,
        fail,
        mergeSteps: sink.mergeSteps,
        step: sink.step,
        toolPath: (pathCtx as string | undefined) ?? 'unknown',
        traceId: traceCtx as string
      },
      steps: sink.steps
    }
  }
  const defineTool = <const Args extends ArgSpecs, const Codes extends readonly string[] = readonly []>(
    def: DefineToolOpts<Args, Codes, TActionCtx, TAuth>
  ): TAct => {
    const handler = async (ctx: TActionCtx, raw: unknown): Promise<WrappedResult> => {
      const { args, authCtx, chatCtx, pathCtx, traceCtx } = unpack(raw)
      const { ctx: base, steps } = baseExtras<Codes>({ authCtx, chatCtx, pathCtx, providedFail: def.fail, traceCtx })
      try {
        const cached: CachedFn<Args> = async <T>(cargs: HandlerArgs<Args>, compute: () => Promise<T>) =>
          deps.cached({
            args: cargs,
            auth: authCtx as TAuth,
            compute,
            ctx,
            toolPath: `${base.toolPath}@${def.version ?? '1'}`
          }) as Promise<T>
        const enhanced = { ...(ctx as object), ...base, cached } as ActionCtxExtras<Args, Codes, TAuth> & TActionCtx
        return { ok: true, result: await def.handler(enhanced, args as HandlerArgs<Args>), steps }
      } catch (error) {
        return { error: toDispatchError(error), ok: false, steps }
      }
    }
    const action = deps.internalAction({
      args: buildFullArgs(def.args),
      handler
    })
    Object.assign(action as object, { argSpecs: def.args, meta: buildMeta(def) })
    return action
  }
  const defineQuery = <const Args extends ArgSpecs, const Codes extends readonly string[] = readonly []>(
    def: DefineQueryOpts<Args, Codes, TQueryCtx, TAuth>
  ): TQry => {
    const handler = async (ctx: TQueryCtx, raw: unknown): Promise<WrappedResult> => {
      const { args, authCtx, chatCtx, pathCtx, traceCtx } = unpack(raw)
      const { ctx: base, steps } = baseExtras<Codes>({ authCtx, chatCtx, pathCtx, providedFail: def.fail, traceCtx })
      try {
        const enhanced = { ...(ctx as object), ...base } as ReadCtxExtras<Codes, TAuth> & TQueryCtx
        return { ok: true, result: await def.handler(enhanced, args as HandlerArgs<Args>), steps }
      } catch (error) {
        return { error: toDispatchError(error), ok: false, steps }
      }
    }
    const query = deps.internalQuery({
      args: buildFullArgs(def.args),
      handler
    })
    Object.assign(query as object, { argSpecs: def.args, meta: buildMeta(def) })
    return query
  }
  const defineMutation = <const Args extends ArgSpecs, const Codes extends readonly string[] = readonly []>(
    def: DefineMutationOpts<Args, Codes, TMutationCtx, TAuth>
  ): TMut => {
    const handler = async (ctx: TMutationCtx, raw: unknown): Promise<WrappedResult> => {
      const { args, authCtx, chatCtx, pathCtx, traceCtx } = unpack(raw)
      const { ctx: base, steps } = baseExtras<Codes>({ authCtx, chatCtx, pathCtx, providedFail: def.fail, traceCtx })
      try {
        const enhanced = { ...(ctx as object), ...base } as ReadCtxExtras<Codes, TAuth> & TMutationCtx
        return { ok: true, result: await def.handler(enhanced, args as HandlerArgs<Args>), steps }
      } catch (error) {
        return { error: toDispatchError(error), ok: false, steps }
      }
    }
    const mutation = deps.internalMutation({
      args: buildFullArgs(def.args),
      handler
    })
    Object.assign(mutation as object, { argSpecs: def.args, meta: buildMeta(def) })
    return mutation
  }
  return { defineMutation, defineQuery, defineTool }
}
export { arg, createBuilder, createStepSink, makeFail }
export type {
  ActionCtxExtras,
  ArgSpec,
  ArgSpecs,
  BuilderDeps,
  CommonOpts,
  DefineMutationOpts,
  DefineQueryOpts,
  DefineToolOpts,
  FailArg,
  FailFn,
  HandlerArgs,
  ReadCtxExtras,
  Step,
  StepSink
}
