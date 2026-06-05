/* eslint-disable complexity */
import type { ContentBlock, StreamEvent } from 'backend/convex/streamProtocol'
import { assemblePartials } from './partials'
import { parseMessageFromObject, parseStreamEvent } from './stream'

const parseCache = new WeakMap<object, null | StreamEvent>()
const parseWithCache = (event: { content: string }): null | StreamEvent => {
  const hit = parseCache.get(event)
  if (hit !== undefined) return hit
  const parsed = parseStreamEvent(event.content)
  parseCache.set(event, parsed)
  return parsed
}
type ChatChunk =
  | { blocks: ContentBlock[]; id: string; kind: 'agent'; msgMeta: Record<string, unknown> }
  | { id: string; kind: 'partial'; text: string }
  | { id: string; kind: 'status'; text: string; tone: 'error' | 'info' | 'warn' }
  | { id: string; kind: 'user-text'; text: string }
interface RawEvent {
  _id: string
  content: string
}
const buildMsgMeta = (e: StreamEvent, evMsg: Record<string, unknown> | undefined): Record<string, unknown> => {
  const out: Record<string, unknown> = {}
  for (const [k, val] of Object.entries(e)) if (k !== 'message' && k !== 'type') out[k] = val
  for (const [k, val] of Object.entries(evMsg ?? {})) if (k !== 'content') out[k] = val
  return out
}
type PerEventOutput =
  | null
  | { blocks: ContentBlock[]; kind: 'agent'; msgMeta: Record<string, unknown> }
  | { blocks: ContentBlock[]; kind: 'agent-error' }
  | { kind: 'status'; text: string; tone: 'error' | 'info' | 'warn' }
  | { kind: 'user-text'; text: string }
const API_ERROR_RE = /^API Error:\s*(?<status>\d{3})\s*(?<rest>.*)$/u
const TOO_MANY_RE = /too many concurrent/iu
const BUDGET_RE = /daily owner USD budget|budget exhausted/iu
const TURN_BUDGET_RE = /turn budget exhausted/iu
const NOT_PRICED_RE = /model not priced/iu
const UPSTREAM_TIMEOUT_RE = /upstream timeout/iu
const detectApiError = (text: string): null | string => {
  const m = API_ERROR_RE.exec(text.trim())
  const status = m?.groups?.status
  const rest = m?.groups?.rest ?? ''
  if (!status) return null
  if (TOO_MANY_RE.test(rest))
    return 'Sorry — too many requests in flight on your account right now. Give it a minute and try again. If it keeps happening, your admin can clear the queue.'
  if (BUDGET_RE.test(rest))
    return "You've reached today's usage limit. New questions will work again tomorrow, or ask your admin to raise your daily limit."
  if (TURN_BUDGET_RE.test(rest)) return 'This conversation has reached its message limit. Start a new chat to keep going.'
  if (NOT_PRICED_RE.test(rest))
    return 'The assistant ran into a configuration problem (model pricing missing). Please tell your admin.'
  if (UPSTREAM_TIMEOUT_RE.test(rest))
    return 'The assistant took too long to answer this one. Try rephrasing or breaking the question into smaller parts.'
  if (status === '402') return 'Sorry — your usage cap was reached. Try again later, or ask your admin to raise the limit.'
  if (status === '429') return 'The assistant is busy. Give it a few seconds and try again.'
  if (status.startsWith('5')) return 'The assistant is having trouble responding right now. Please try again in a moment.'
  return `Something went wrong (${status}). Please try again or tell your admin if it keeps happening.`
}
const perEventCache = new WeakMap<RawEvent, PerEventOutput>()
const computePerEventOutput = (e: StreamEvent): PerEventOutput => {
  const evMsg = e.type === 'assistant' || e.type === 'user' ? e.message : undefined
  const msgContent = evMsg?.content ?? []
  if (e.type === 'user' && msgContent.length > 0 && msgContent.every(b => b.type === 'text')) {
    const userText = msgContent.map(b => (typeof b.text === 'string' ? b.text : '')).join('\n')
    return userText.trim() ? { kind: 'user-text', text: userText } : null
  }
  if (e.type === 'assistant' || e.type === 'user') {
    const pm = parseMessageFromObject(evMsg ?? {}, '')
    if (pm.blocks.length === 0) return null
    if (e.type === 'assistant') {
      const firstTextBlock = pm.blocks.find(b => b.type === 'text')
      const firstText = typeof firstTextBlock?.text === 'string' ? firstTextBlock.text : ''
      const apiErr = detectApiError(firstText)
      if (apiErr) return { blocks: [{ text: `> **${apiErr}**`, type: 'text' }], kind: 'agent-error' }
    }
    return { blocks: pm.blocks, kind: 'agent', msgMeta: buildMsgMeta(e, evMsg) }
  }
  if (e.type === 'error' && e.error)
    return { blocks: [{ text: `> **error** ${e.error}`, type: 'text' }], kind: 'agent-error' }
  if (e.type === 'system' && e.subtype === 'api_retry') {
    const attempt = e.attempt ?? 0
    const max = e.max_retries ?? 0
    const status = e.error_status ? `${e.error_status} ` : ''
    const delay = e.retry_delay_ms ? ` (retry in ${Math.round(e.retry_delay_ms / 1000)}s)` : ''
    return { kind: 'status', text: `Anthropic ${status}— retry ${attempt}/${max}${delay}`, tone: 'warn' }
  }
  return null
}
const perEventWithCache = (evt: RawEvent, e: StreamEvent): PerEventOutput => {
  const hit = perEventCache.get(evt)
  if (hit !== undefined) return hit
  const out = computePerEventOutput(e)
  perEventCache.set(evt, out)
  return out
}
const sourceToChunks = (events: RawEvent[]): ChatChunk[] => {
  const parsed: { _id: string; e: StreamEvent; evt: RawEvent }[] = []
  for (const evt of events) {
    const e = parseWithCache(evt)
    if (e) parsed.push({ _id: evt._id, e, evt })
  }
  const completedBlockCountByMsg = new Map<string, number>()
  for (const p of parsed)
    if (p.e.type === 'assistant' || p.e.type === 'user') {
      const msg = p.e.message
      if (msg && typeof msg.id === 'string')
        completedBlockCountByMsg.set(
          msg.id,
          (completedBlockCountByMsg.get(msg.id) ?? 0) + (Array.isArray(msg.content) ? msg.content.length : 0)
        )
    }
  const chunks: ChatChunk[] = []
  let userTextIdx = 0
  for (const p of parsed) {
    const out = perEventWithCache(p.evt, p.e)
    if (out?.kind === 'user-text') {
      chunks.push({ id: `user-${userTextIdx}`, kind: 'user-text', text: out.text })
      userTextIdx += 1
    } else if (out?.kind === 'agent') chunks.push({ blocks: out.blocks, id: p._id, kind: 'agent', msgMeta: out.msgMeta })
    else if (out?.kind === 'agent-error') chunks.push({ blocks: out.blocks, id: p._id, kind: 'agent', msgMeta: {} })
    else if (out?.kind === 'status') chunks.push({ id: p._id, kind: 'status', text: out.text, tone: out.tone })
  }
  const partials = assemblePartials(parsed, completedBlockCountByMsg)
  for (const p of partials)
    for (const b of p.blocks)
      if (b.acc.trim()) chunks.push({ id: `${p.id}-${b.blockIndex}`, kind: 'partial', text: b.acc })
  return chunks
}
export { parseWithCache, sourceToChunks }
export type { ChatChunk, RawEvent }
