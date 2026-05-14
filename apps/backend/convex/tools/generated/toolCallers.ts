import type { FunctionReference } from 'convex/server'
import type { ActionCtx, MutationCtx, QueryCtx } from '../../_generated/server'
import type { Called, Wrapped } from '@a/cli'
import { internal } from '../../_generated/api'
import { callResult, unwrap, wrapArgs } from '@a/cli'
import type { DocsDiffArgs, DocsDiffResult, DocsGrepArgs, DocsGrepResult, DocsListArgs, DocsListResult, DocsReadArgs, DocsReadResult, DocsSimilarArgs, DocsSimilarResult } from './toolTypes'
const callDocsDiff = async (ctx: QueryCtx, args: DocsDiffArgs): Promise<Called<DocsDiffResult>> => {
  const r = (await ctx.runQuery(internal.tools.docs.diff.action, wrapArgs(args, "docs.diff"))) as Wrapped<DocsDiffResult>
  return unwrap(r)
}
const callDocsGrep = async (ctx: QueryCtx, args: DocsGrepArgs): Promise<Called<DocsGrepResult>> => {
  const r = (await ctx.runQuery(internal.tools.docs.grep.action, wrapArgs(args, "docs.grep"))) as Wrapped<DocsGrepResult>
  return unwrap(r)
}
const callDocsList = async (ctx: QueryCtx, args: DocsListArgs): Promise<Called<DocsListResult>> => {
  const r = (await ctx.runQuery(internal.tools.docs.list.action, wrapArgs(args, "docs.list"))) as Wrapped<DocsListResult>
  return unwrap(r)
}
const callDocsRead = async (ctx: QueryCtx, args: DocsReadArgs): Promise<Called<DocsReadResult>> => {
  const r = (await ctx.runQuery(internal.tools.docs.read.action, wrapArgs(args, "docs.read"))) as Wrapped<DocsReadResult>
  return unwrap(r)
}
const callDocsSimilar = async (ctx: ActionCtx, args: DocsSimilarArgs): Promise<Called<DocsSimilarResult>> => {
  const r = (await ctx.runAction(internal.tools.docs.similar.action, wrapArgs(args, "docs.similar"))) as Wrapped<DocsSimilarResult>
  return unwrap(r)
}
const callersTree = {
  docs: {
    diff: callDocsDiff,
    grep: callDocsGrep,
    list: callDocsList,
    read: callDocsRead,
    similar: callDocsSimilar
  }
} as const
type FnEntry =
  | { fn: FunctionReference<'action', 'internal'>; kind: 'action' }
  | { fn: FunctionReference<'mutation', 'internal'>; kind: 'mutation' }
  | { fn: FunctionReference<'query', 'internal'>; kind: 'query' }
const fnByPath: Record<string, FnEntry> = {
  "docs.diff": { fn: internal.tools.docs.diff.action as unknown as FunctionReference<'query', 'internal'>, kind: 'query' as const },
  "docs.grep": { fn: internal.tools.docs.grep.action as unknown as FunctionReference<'query', 'internal'>, kind: 'query' as const },
  "docs.list": { fn: internal.tools.docs.list.action as unknown as FunctionReference<'query', 'internal'>, kind: 'query' as const },
  "docs.read": { fn: internal.tools.docs.read.action as unknown as FunctionReference<'query', 'internal'>, kind: 'query' as const },
  "docs.similar": { fn: internal.tools.docs.similar.action as unknown as FunctionReference<'action', 'internal'>, kind: 'action' as const }
}
interface ToolTable {
  "docs.diff": { args: DocsDiffArgs; ctx: QueryCtx; kind: 'query'; result: DocsDiffResult };
  "docs.grep": { args: DocsGrepArgs; ctx: QueryCtx; kind: 'query'; result: DocsGrepResult };
  "docs.list": { args: DocsListArgs; ctx: QueryCtx; kind: 'query'; result: DocsListResult };
  "docs.read": { args: DocsReadArgs; ctx: QueryCtx; kind: 'query'; result: DocsReadResult };
  "docs.similar": { args: DocsSimilarArgs; ctx: ActionCtx; kind: 'action'; result: DocsSimilarResult };
}
const callers = callersTree
export { callers, callResult, fnByPath }
export type { Called, Wrapped } from '@a/cli'
export type { ToolTable }