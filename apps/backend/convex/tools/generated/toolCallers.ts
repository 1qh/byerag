import type { FunctionReference } from 'convex/server'
import type { ActionCtx, MutationCtx, QueryCtx } from '../../_generated/server'
import type { Called, Wrapped } from '@a/cli'
import { internal } from '../../_generated/api'
import { callResult, unwrap, wrapArgs } from '@a/cli'
import type { DocsConflictArgs, DocsConflictResult, DocsDiffArgs, DocsDiffResult, DocsGrepArgs, DocsGrepResult, DocsListArgs, DocsListResult, DocsReadArgs, DocsReadResult, DocsSimilarArgs, DocsSimilarResult, TrainingAttemptDetailArgs, TrainingAttemptDetailResult, TrainingAttemptsArgs, TrainingAttemptsResult, TrainingStatusResult, TrainingTopicsResult } from './toolTypes'
const callDocsConflict = async (ctx: ActionCtx, args: DocsConflictArgs): Promise<Called<DocsConflictResult>> => {
  const r = (await ctx.runAction(internal.tools.docs.conflict.action, wrapArgs(args, "docs.conflict"))) as Wrapped<DocsConflictResult>
  return unwrap(r)
}
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
const callTrainingAttemptDetail = async (ctx: QueryCtx, args: TrainingAttemptDetailArgs): Promise<Called<TrainingAttemptDetailResult>> => {
  const r = (await ctx.runQuery(internal.tools.training.attemptDetail.action, wrapArgs(args, "training.attempt-detail"))) as Wrapped<TrainingAttemptDetailResult>
  return unwrap(r)
}
const callTrainingAttempts = async (ctx: QueryCtx, args: TrainingAttemptsArgs): Promise<Called<TrainingAttemptsResult>> => {
  const r = (await ctx.runQuery(internal.tools.training.attempts.action, wrapArgs(args, "training.attempts"))) as Wrapped<TrainingAttemptsResult>
  return unwrap(r)
}
const callTrainingStatus = async (ctx: QueryCtx, args: Record<string, never>): Promise<Called<TrainingStatusResult>> => {
  const r = (await ctx.runQuery(internal.tools.training.status.action, wrapArgs(args, "training.status"))) as Wrapped<TrainingStatusResult>
  return unwrap(r)
}
const callTrainingTopics = async (ctx: QueryCtx, args: Record<string, never>): Promise<Called<TrainingTopicsResult>> => {
  const r = (await ctx.runQuery(internal.tools.training.topics.action, wrapArgs(args, "training.topics"))) as Wrapped<TrainingTopicsResult>
  return unwrap(r)
}
const callersTree = {
  docs: {
    conflict: callDocsConflict,
    diff: callDocsDiff,
    grep: callDocsGrep,
    list: callDocsList,
    read: callDocsRead,
    similar: callDocsSimilar
  },
  training: {
    "attempt-detail": callTrainingAttemptDetail,
    attempts: callTrainingAttempts,
    status: callTrainingStatus,
    topics: callTrainingTopics
  }
} as const
type FnEntry =
  | { fn: FunctionReference<'action', 'internal'>; kind: 'action' }
  | { fn: FunctionReference<'mutation', 'internal'>; kind: 'mutation' }
  | { fn: FunctionReference<'query', 'internal'>; kind: 'query' }
const fnByPath: Record<string, FnEntry> = {
  "docs.conflict": { fn: internal.tools.docs.conflict.action as unknown as FunctionReference<'action', 'internal'>, kind: 'action' as const },
  "docs.diff": { fn: internal.tools.docs.diff.action as unknown as FunctionReference<'query', 'internal'>, kind: 'query' as const },
  "docs.grep": { fn: internal.tools.docs.grep.action as unknown as FunctionReference<'query', 'internal'>, kind: 'query' as const },
  "docs.list": { fn: internal.tools.docs.list.action as unknown as FunctionReference<'query', 'internal'>, kind: 'query' as const },
  "docs.read": { fn: internal.tools.docs.read.action as unknown as FunctionReference<'query', 'internal'>, kind: 'query' as const },
  "docs.similar": { fn: internal.tools.docs.similar.action as unknown as FunctionReference<'action', 'internal'>, kind: 'action' as const },
  "training.attempt-detail": { fn: internal.tools.training.attemptDetail.action as unknown as FunctionReference<'query', 'internal'>, kind: 'query' as const },
  "training.attempts": { fn: internal.tools.training.attempts.action as unknown as FunctionReference<'query', 'internal'>, kind: 'query' as const },
  "training.status": { fn: internal.tools.training.status.action as unknown as FunctionReference<'query', 'internal'>, kind: 'query' as const },
  "training.topics": { fn: internal.tools.training.topics.action as unknown as FunctionReference<'query', 'internal'>, kind: 'query' as const }
}
interface ToolTable {
  "docs.conflict": { args: DocsConflictArgs; ctx: ActionCtx; kind: 'action'; result: DocsConflictResult };
  "docs.diff": { args: DocsDiffArgs; ctx: QueryCtx; kind: 'query'; result: DocsDiffResult };
  "docs.grep": { args: DocsGrepArgs; ctx: QueryCtx; kind: 'query'; result: DocsGrepResult };
  "docs.list": { args: DocsListArgs; ctx: QueryCtx; kind: 'query'; result: DocsListResult };
  "docs.read": { args: DocsReadArgs; ctx: QueryCtx; kind: 'query'; result: DocsReadResult };
  "docs.similar": { args: DocsSimilarArgs; ctx: ActionCtx; kind: 'action'; result: DocsSimilarResult };
  "training.attempt-detail": { args: TrainingAttemptDetailArgs; ctx: QueryCtx; kind: 'query'; result: TrainingAttemptDetailResult };
  "training.attempts": { args: TrainingAttemptsArgs; ctx: QueryCtx; kind: 'query'; result: TrainingAttemptsResult };
  "training.status": { args: Record<string, never>; ctx: QueryCtx; kind: 'query'; result: TrainingStatusResult };
  "training.topics": { args: Record<string, never>; ctx: QueryCtx; kind: 'query'; result: TrainingTopicsResult };
}
const callers = callersTree
export { callers, callResult, fnByPath }
export type { Called, Wrapped } from '@a/cli'
export type { ToolTable }