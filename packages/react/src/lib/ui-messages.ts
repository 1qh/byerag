/** biome-ignore-all lint/nursery/noContinue: state-machine loop, continue is clearest */
/* eslint-disable complexity, no-continue */
import type { ContentBlock } from 'backend/convex/streamProtocol'
import type { ChatChunk } from '../parsers/chunks'

interface SearchItem {
  content: unknown
  type: 'code_execution_tool_result' | 'web_fetch_tool_result' | 'web_search_tool_result'
}
type ToolState = 'input-streaming' | 'output-available'
interface UIMessage {
  id: string
  parts: UIPart[]
  role: 'assistant' | 'user'
}
type UIPart =
  | {
      input: Record<string, unknown> | undefined
      output: unknown
      state: ToolState
      toolName: string
      type: 'data-tool-x'
    }
  | { items: SearchItem[]; type: 'data-sources' }
  | { text: string; tone: 'error' | 'info' | 'warn'; type: 'status' }
  | { text: string; type: 'reasoning' }
  | { text: string; type: 'text' }
  | { type: 'raw'; value: ContentBlock }
const SEARCH_TYPES = new Set(['code_execution_tool_result', 'web_fetch_tool_result', 'web_search_tool_result'])
const RESULT_TYPES = new Set(['tool_result', ...SEARCH_TYPES])
const isToolUse = (b: ContentBlock): boolean => b.type === 'tool_use' || b.type === 'server_tool_use'
const isSearchResult = (b: ContentBlock): boolean => SEARCH_TYPES.has(b.type) && 'content' in b
const isAnyResult = (b: ContentBlock): boolean => RESULT_TYPES.has(b.type)
const collectResultsAndToolUseIds = (
  chunks: readonly ChatChunk[]
): { allToolUseIds: Set<string>; resultsById: Map<string, ContentBlock> } => {
  const resultsById = new Map<string, ContentBlock>()
  const allToolUseIds = new Set<string>()
  for (const c of chunks)
    if (c.kind === 'agent')
      for (const b of c.blocks) {
        if (isAnyResult(b) && 'tool_use_id' in b && b.tool_use_id) resultsById.set(b.tool_use_id, b)
        if (isToolUse(b) && 'id' in b && b.id) allToolUseIds.add(b.id)
      }
  return { allToolUseIds, resultsById }
}
const blocksToParts = (
  blocks: readonly ContentBlock[],
  resultsById: ReadonlyMap<string, ContentBlock>,
  allToolUseIds: ReadonlySet<string>
): UIPart[] => {
  const parts: UIPart[] = []
  const sourceBuf: SearchItem[] = []
  const flushSources = (): void => {
    if (sourceBuf.length === 0) return
    parts.push({ items: [...sourceBuf], type: 'data-sources' })
    sourceBuf.length = 0
  }
  for (const b of blocks) {
    if (b.type === 'text') {
      flushSources()
      const txt = 'text' in b ? (b.text ?? '') : ''
      if (txt.trim()) parts.push({ text: txt, type: 'text' })
      continue
    }
    if (b.type === 'thinking') {
      flushSources()
      const txt = 'thinking' in b ? (b.thinking ?? '') : ''
      if (txt.trim()) parts.push({ text: txt, type: 'reasoning' })
      continue
    }
    if (isToolUse(b)) {
      if (!('id' in b && b.id)) continue
      const match = resultsById.get(b.id)
      if (b.type === 'server_tool_use' && match && isSearchResult(match)) {
        sourceBuf.push({ content: 'content' in match ? match.content : undefined, type: match.type as SearchItem['type'] })
        continue
      }
      flushSources()
      parts.push({
        input: 'input' in b ? b.input : undefined,
        output: match && 'content' in match ? match.content : undefined,
        state: match ? 'output-available' : 'input-streaming',
        toolName: 'name' in b ? (b.name ?? 'tool') : 'tool',
        type: 'data-tool-x'
      })
      continue
    }
    if (isAnyResult(b)) {
      const paired = 'tool_use_id' in b && b.tool_use_id ? allToolUseIds.has(b.tool_use_id) : false
      if (paired) continue
      if (isSearchResult(b)) {
        sourceBuf.push({ content: 'content' in b ? b.content : undefined, type: b.type as SearchItem['type'] })
        continue
      }
      flushSources()
      parts.push({ type: 'raw', value: b })
      continue
    }
    flushSources()
    parts.push({ type: 'raw', value: b })
  }
  flushSources()
  return parts
}
const mergeAssistantRuns = (messages: readonly UIMessage[]): UIMessage[] => {
  const out: UIMessage[] = []
  for (const m of messages) {
    const last = out.at(-1)
    if (m.role === 'assistant' && last?.role === 'assistant') last.parts.push(...m.parts)
    else out.push({ id: m.id, parts: [...m.parts], role: m.role })
  }
  return out
}
const chunksToMessages = (chunks: readonly ChatChunk[]): UIMessage[] => {
  const { resultsById, allToolUseIds } = collectResultsAndToolUseIds(chunks)
  const raw: UIMessage[] = []
  for (const c of chunks)
    if (c.kind === 'user-text') raw.push({ id: c.id, parts: [{ text: c.text, type: 'text' }], role: 'user' })
    else if (c.kind === 'partial') raw.push({ id: c.id, parts: [{ text: c.text, type: 'text' }], role: 'assistant' })
    else if (c.kind === 'status')
      raw.push({ id: c.id, parts: [{ text: c.text, tone: c.tone, type: 'status' }], role: 'assistant' })
    else {
      const parts = blocksToParts(c.blocks, resultsById, allToolUseIds)
      if (parts.length > 0) raw.push({ id: c.id, parts, role: 'assistant' })
    }
  return mergeAssistantRuns(raw)
}
export { chunksToMessages }
export type { SearchItem, ToolState, UIMessage, UIPart }
