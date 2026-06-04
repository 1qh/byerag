'use client'
import type { UIMessage } from '@a/react/lib'
import type { Id } from 'backend/convex/_generated/dataModel'
import type { ReactNode } from 'react'
import { extractSources, parseToolPath } from '@a/react/lib'
import { cn } from '@a/ui'
import { Source, Sources, SourcesContent, SourcesTrigger } from '@a/ui/components/ai-elements/sources'
import { ChevronDown, Loader2 } from 'lucide-react'
import { Fragment, memo, useEffect, useRef, useState } from 'react'
import { useMessagePartRegistry, useToolCard } from '../registries'
import { Actions } from './message-actions'
import { MessageTextPart } from './message-text-part'

interface PreviewMessageProps {
  chatId?: Id<'chats'> | null
  isLoading: boolean
  message: UIMessage
}
interface TextPart {
  text: string
  type: 'text'
}
const isTextPart = (p: unknown): p is TextPart =>
  p !== null &&
  typeof p === 'object' &&
  'type' in p &&
  p.type === 'text' &&
  'text' in p &&
  typeof (p as { text: unknown }).text === 'string'
const formatOutput = (v: unknown): string => {
  if (typeof v === 'string') return v
  if (Array.isArray(v) && v.every(isTextPart)) return v.map(p => p.text).join('')
  return JSON.stringify(v, null, 2)
}
const basename = (p: string): string => p.split('/').findLast(Boolean) ?? p
const oneLine = (s: string): string => s.replaceAll(/\s+/gu, ' ').trim()
const QUERY_RE = /--query\s+"(?<query>[^"]+)"/u
const ID_RE = /--id\s+(?<id>\S+)/u
const SCOPE_RE = /--scope\s+(?<scope>\S+)/u
const toolLabel = (toolName: string, input: Record<string, unknown> | undefined): string => {
  const path = parseToolPath(input)
  if (path) {
    const cmd = typeof input?.command === 'string' ? input.command : ''
    const q = QUERY_RE.exec(cmd)?.groups?.query
    const id = ID_RE.exec(cmd)?.groups?.id
    const scope = SCOPE_RE.exec(cmd)?.groups?.scope
    const hint = q ? `"${q}"` : (id ?? scope ?? '')
    return oneLine(`${path.join(' ')}${hint ? ` ${hint}` : ''}`).slice(0, 70)
  }
  if (toolName === 'Read' && typeof input?.file_path === 'string') return `Read ${basename(input.file_path)}`
  if (toolName === 'Read' && typeof input?.path === 'string') return `Read ${basename(input.path)}`
  return toolName
}
type DataSourcesPart = Extract<UIMessage['parts'][number], { type: 'data-sources' }>
const sourcesCache = new WeakMap<DataSourcesPart['items'], ReturnType<typeof extractSources>>()
const sourcesEntriesFor = (items: DataSourcesPart['items']): ReturnType<typeof extractSources> => {
  const hit = sourcesCache.get(items)
  if (hit) return hit
  const entries = items.flatMap(it => extractSources(it.content))
  sourcesCache.set(items, entries)
  return entries
}
const partsSigCache = new WeakMap<UIMessage['parts'], string>()
const partsSignature = (m: UIMessage): string => {
  const cached = partsSigCache.get(m.parts)
  if (cached !== undefined) return cached
  const sig = m.parts
    .map(p => {
      if (p.type === 'text') return `t:${p.text.length}`
      if (p.type === 'reasoning') return `r:${p.text.length}`
      if (p.type === 'status') return `st:${p.tone}:${p.text.length}`
      if (p.type === 'data-tool-x') return `x:${p.state}:${typeof p.output}`
      if (p.type === 'data-sources') return `s:${p.items.length}`
      return `?:${p.type}`
    })
    .join('|')
  partsSigCache.set(m.parts, sig)
  return sig
}
type ActivityPart =
  | Extract<UIMessage['parts'][number], { type: 'data-tool-x' }>
  | Extract<UIMessage['parts'][number], { type: 'reasoning' }>
  | Extract<UIMessage['parts'][number], { type: 'status' }>
  | Extract<UIMessage['parts'][number], { type: 'text' }>
const isActivity = (t: string): boolean => t === 'reasoning' || t === 'status' || t === 'data-tool-x' || t === 'text'
const lastActivityIndex = (parts: UIMessage['parts']): number => {
  let lastReasoningOrTool = -1
  for (const [i, p] of parts.entries())
    if (p.type === 'reasoning' || p.type === 'status' || p.type === 'data-tool-x') lastReasoningOrTool = i
  return lastReasoningOrTool
}
const ActivityRow = ({ part }: { part: ActivityPart }): ReactNode => {
  if (part.type === 'reasoning')
    return <p className='text-muted-foreground text-sm leading-relaxed italic'>{oneLine(part.text)}</p>
  if (part.type === 'text') return <p className='text-muted-foreground text-sm leading-relaxed'>{oneLine(part.text)}</p>
  if (part.type === 'status')
    return (
      <p
        className={cn(
          'text-sm leading-relaxed italic',
          part.tone === 'error'
            ? 'text-destructive'
            : part.tone === 'warn'
              ? 'text-yellow-700 dark:text-yellow-400'
              : 'text-muted-foreground'
        )}>
        {oneLine(part.text)}
      </p>
    )
  const out = part.output === undefined ? '' : oneLine(formatOutput(part.output)).slice(0, 160)
  return (
    <div className='rounded-md border border-muted-foreground/15 bg-background/60 px-2 py-1.5 text-xs'>
      <div className='font-mono text-muted-foreground'>→ {toolLabel(part.toolName, part.input)}</div>
      {out ? <div className='mt-0.5 truncate text-muted-foreground/70'>{out}</div> : null}
    </div>
  )
}
const activityKey = (part: ActivityPart): string => {
  if (part.type === 'data-tool-x') return `x:${toolLabel(part.toolName, part.input)}`
  return `${part.type}:${oneLine(part.text).slice(0, 24)}`
}
const ActivityRows = ({ parts }: { parts: ActivityPart[] }): ReactNode => {
  const seen = new Map<string, number>()
  return parts.map(part => {
    const base = activityKey(part)
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    return <ActivityRow key={`${base}#${n}`} part={part} />
  })
}
const summarizeTools = (parts: ActivityPart[]): string => {
  const seen = new Set<string>()
  for (const p of parts)
    if (p.type === 'data-tool-x') {
      const path = parseToolPath(p.input)
      const label = path ? path.join(' ') : p.toolName
      seen.add(label)
    }
  return [...seen].slice(0, 3).join(', ')
}
const ThinkingBlock = ({ isLoading, parts }: { isLoading: boolean; parts: ActivityPart[] }): ReactNode => {
  // eslint-disable-next-line react/hook-use-state -- one-shot render-time snapshot of when this block first mounted
  const [startedAt] = useState(() => Date.now())
  const [elapsedSec, setElapsedSec] = useState<null | number>(null)
  const wasLoadingRef = useRef(isLoading)
  useEffect(() => {
    if (wasLoadingRef.current && !isLoading)
      // eslint-disable-next-line @eslint-react/hooks-extra/no-direct-set-state-in-use-effect -- snapshot elapsed time on transition
      setElapsedSec(Math.max(1, Math.round((Date.now() - startedAt) / 1000)))
    wasLoadingRef.current = isLoading
  }, [isLoading, startedAt])
  const [manuallyOpen, setManuallyOpen] = useState<boolean | null>(null)
  const open = manuallyOpen ?? isLoading
  const toolSummary = summarizeTools(parts)
  const pillSuffix = toolSummary ? ` · ${toolSummary}` : ''
  const pillLabel = isLoading
    ? 'Thinking…'
    : elapsedSec === null
      ? `Thought${pillSuffix}`
      : `Thought for ${elapsedSec}s${pillSuffix}`
  return (
    <div className='my-2 rounded-xl bg-muted/40 px-3 py-2 transition-colors'>
      <button
        className='flex w-full items-center gap-2 text-left text-muted-foreground text-sm hover:text-foreground'
        onClick={() => setManuallyOpen(o => !(o ?? isLoading))}
        type='button'>
        {isLoading ? (
          <Loader2 aria-hidden className='size-3 animate-spin' />
        ) : (
          <ChevronDown aria-hidden className={cn('size-3 transition-transform', !open && '-rotate-90')} />
        )}
        <span className='truncate'>{pillLabel}</span>
      </button>
      {open ? (
        <div className='mt-2 space-y-1.5 border-muted-foreground/20 border-l pl-3'>
          <ActivityRows parts={parts} />
        </div>
      ) : null}
    </div>
  )
}
const PurePreviewMessage = ({ chatId, isLoading, message }: PreviewMessageProps) => {
  const customRenderers = useMessagePartRegistry()
  useToolCard()
  const nodes: ReactNode[] = []
  let buffer: ActivityPart[] = []
  const flush = (idx: number): void => {
    if (buffer.length === 0) return
    const grouped = buffer
    nodes.push(
      // oxlint-disable-next-line react-perf/jsx-no-new-array-as-prop
      <ThinkingBlock isLoading={isLoading} key={`${message.id}-think-${idx}`} parts={grouped} />
    )
    buffer = []
  }
  const cutoff = lastActivityIndex(message.parts)
  for (const [index, part] of message.parts.entries()) {
    const key = `${message.id}-part-${index}`
    const custom = customRenderers?.[part.type]
    const isTextBeforeCutoff = part.type === 'text' && index < cutoff
    if (!custom && (isActivity(part.type) ? part.type !== 'text' || isTextBeforeCutoff : false))
      buffer.push(part as ActivityPart)
    else {
      flush(index)
      if (custom) nodes.push(<Fragment key={key}>{custom(part, { isLoading, message })}</Fragment>)
      else if (part.type === 'text')
        nodes.push(<MessageTextPart key={key} messageId={message.id} messageRole={message.role} text={part.text} />)
      else if (part.type === 'data-sources') {
        const entries = sourcesEntriesFor(part.items)
        if (entries.length > 0)
          nodes.push(
            <Sources key={key}>
              <SourcesTrigger count={entries.length} />
              <SourcesContent>
                {entries.map(e => (
                  <Source href={e.url} key={e.url} title={`${e.domain} — ${e.title}`} />
                ))}
              </SourcesContent>
            </Sources>
          )
      } else
        nodes.push(
          <pre className='text-xs opacity-70 overflow-x-auto' data-verbose='debug' key={key}>
            {formatOutput('value' in part ? part.value : part)}
          </pre>
        )
    }
  }
  flush(message.parts.length)
  return (
    <div className='group/message [content-visibility:auto] [contain-intrinsic-size:0_200px]'>
      {nodes}
      {message.role !== 'user' && (
        <Actions chatId={chatId} isLoading={isLoading} key={`action-${message.id}`} message={message} />
      )}
    </div>
  )
}
const PreviewMessage = memo(PurePreviewMessage, (prev, next) => {
  if (prev.isLoading !== next.isLoading) return false
  if (prev.message.id !== next.message.id) return false
  return partsSignature(prev.message) === partsSignature(next.message)
})
export { PreviewMessage }
