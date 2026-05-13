import type {
  ActionCtxExtras,
  ArgSpec,
  ArgSpecs,
  FailFn,
  DefineMutationOpts as GenericDefineMutationOpts,
  DefineQueryOpts as GenericDefineQueryOpts,
  DefineToolOpts as GenericDefineToolOpts,
  HandlerArgs,
  ReadCtxExtras
} from '@a/cli'
import type { PropertyValidators, Validator } from 'convex/values'
import { arg, createBuilder, defineProvider, makeFail } from '@a/cli'
import type { ActionCtx, MutationCtx, QueryCtx } from '../_generated/server'
import type { ResolvedAuth } from './_app/auth'
import { internalAction, internalMutation, internalQuery } from '../_generated/server'
import { AUTH_VALIDATOR } from './_app/auth'
import { cached as projectCached } from './_app/cache'
type Action = ReturnType<typeof internalAction>
interface ConvexBind {
  action: (def: { args: PropertyValidators; handler: (ctx: ActionCtx, raw: unknown) => Promise<unknown> }) => Action
  mutation: (def: { args: PropertyValidators; handler: (ctx: MutationCtx, raw: unknown) => Promise<unknown> }) => Mutation
  query: (def: { args: PropertyValidators; handler: (ctx: QueryCtx, raw: unknown) => Promise<unknown> }) => Query
}
type Mutation = ReturnType<typeof internalMutation>
type Query = ReturnType<typeof internalQuery>
const convexBind = {
  action: internalAction as ConvexBind['action'],
  mutation: internalMutation as ConvexBind['mutation'],
  query: internalQuery as ConvexBind['query']
}
const builder = createBuilder({
  authValidator: AUTH_VALIDATOR as Validator<ResolvedAuth, 'required', string>,
  cached: async ({ auth, ctx, toolPath, args, compute }) =>
    projectCached({ args, compute, ctx, mode: auth.mode, owner: auth.owner, toolPath }),
  internalAction: convexBind.action,
  internalMutation: convexBind.mutation,
  internalQuery: convexBind.query
})
const { defineMutation, defineQuery, defineTool } = builder
type DefineMutationOpts<Args extends ArgSpecs, Codes extends readonly string[]> = GenericDefineMutationOpts<
  Args,
  Codes,
  MutationCtx,
  ResolvedAuth
>
type DefineQueryOpts<Args extends ArgSpecs, Codes extends readonly string[]> = GenericDefineQueryOpts<
  Args,
  Codes,
  QueryCtx,
  ResolvedAuth
>
type DefineToolOpts<Args extends ArgSpecs, Codes extends readonly string[]> = GenericDefineToolOpts<
  Args,
  Codes,
  ActionCtx,
  ResolvedAuth
>
export { arg, defineMutation, defineProvider, defineQuery, defineTool, makeFail }
export type {
  ActionCtxExtras,
  ArgSpec,
  ArgSpecs,
  DefineMutationOpts,
  DefineQueryOpts,
  DefineToolOpts,
  FailFn,
  HandlerArgs,
  ReadCtxExtras
}
