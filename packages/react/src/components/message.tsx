'use client'
import type { UIMessage } from '@a/react/lib'
import type { Id } from 'backend/convex/_generated/dataModel'
import { extractSources, parseToolPath } from '@a/react/lib'
import { Source, Sources, SourcesContent, SourcesTrigger } from '@a/ui/components/ai-elements/sources'
import { cn } from '@a/ui/lib/utils'
import { ChevronRight } from 'lucide-react'
import { Fragment, memo, type ReactNode, useState } from 'react'
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
const basename = (p: string): string => p.split('/').filter(Boolean).at(-1) ?? p
const oneLine = (s: string): string => s.replace(/\s+/gu, ' ').trim()
const toolLabel = (toolName: string, input: Record<string, unknown> | undefined): string => {
  const path = parseToolPath(input)
  if (path) {
    const cmd = typeof input?.command === 'string' ? input.command : ''
    const q = /--query\s+"([^"]+)"/u.exec(cmd)?.[1]
    const id = /--id\s+(\S+)/u.exec(cmd)?.[1]
    const scope = /--scope\s+(\S+)/u.exec(cmd)?.[1]
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
const isActivity = (t: string): boolean => t === 'reasoning' || t === 'status' || t === 'data-tool-x'
const ActivityRow = ({ part }: { part: ActivityPart }): ReactNode => {
  if (part.type === 'reasoning')
    return <div className='py-0.5 text-muted-foreground/80 text-xs italic'>{oneLine(part.text)}</div>
  if (part.type === 'status')
    return (
      <div
        className={cn(
          'py-0.5 text-xs',
          part.tone === 'error'
            ? 'text-destructive'
            : part.tone === 'warn'
              ? 'text-yellow-700 dark:text-yellow-400'
              : 'text-muted-foreground/80'
        )}>
        {oneLine(part.text)}
      </div>
    )
  const out = part.output === undefined ? '' : oneLine(formatOutput(part.output)).slice(0, 120)
  return (
    <div className='py-0.5 text-xs'>
      <span className='font-mono text-muted-foreground'>{toolLabel(part.toolName, part.input)}</span>
      {out ? <span className='ml-2 text-muted-foreground/60'>{out}</span> : null}
    </div>
  )
}
const ActivityGroup = ({ initiallyOpen, parts }: { initiallyOpen: boolean; parts: ActivityPart[] }): ReactNode => {
  const [open, setOpen] = useState(initiallyOpen)
  return (
    <div className='my-1.5'>
      <button
        className='flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground'
        onClick={() => setOpen(o => !o)}
        type='button'>
        <ChevronRight aria-hidden className={cn('size-3 transition-transform', open && 'rotate-90')} />
        Worked through {parts.length} step{parts.length === 1 ? '' : 's'}
      </button>
      {open ? (
        <div className='mt-1 ml-4 space-y-0.5 border-muted border-l pl-3'>
          {parts.map((part, i) => (
            <ActivityRow key={`act-${i}`} part={part} />
          ))}
        </div>
      ) : null}
    </div>
  )
}
const PurePreviewMessage = ({ chatId, isLoading, message }: PreviewMessageProps) => {
  const ToolCard = useToolCard()
  const customRenderers = useMessagePartRegistry()
  const nodes: ReactNode[] = []
  let buffer: ActivityPart[] = []
  const flush = (idx: number): void => {
    if (buffer.length === 0) return
    nodes.push(<ActivityGroup initiallyOpen={isLoading} key={`${message.id}-act-${idx}`} parts={buffer} />)
    buffer = []
  }
  message.parts.forEach((part, index) => {
    const key = `${message.id}-part-${index}`
    const custom = customRenderers?.[part.type]
    if (custom) {
      flush(index)
      nodes.push(<Fragment key={key}>{custom(part, { isLoading, message })}</Fragment>)
      return
    }
    if (part.type === 'data-tool-x' && ToolCard) {
      const toolNode = ToolCard({ input: part.input, output: part.output })
      if (toolNode) {
        flush(index)
        nodes.push(<Fragment key={key}>{toolNode}</Fragment>)
        return
      }
    }
    if (isActivity(part.type)) {
      buffer.push(part as ActivityPart)
      return
    }
    flush(index)
    if (part.type === 'text') {
      nodes.push(<MessageTextPart key={key} messageId={message.id} messageRole={message.role} text={part.text} />)
      return
    }
    if (part.type === 'data-sources') {
      const entries = sourcesEntriesFor(part.items)
      if (entries.length === 0) return
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
      return
    }
    nodes.push(
      <pre className='text-xs opacity-70 overflow-x-auto' data-verbose='debug' key={key}>
        {formatOutput(part.value)}
      </pre>
    )
  })
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
