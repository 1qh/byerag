'use client'
import type { UIMessage } from '@a/react/lib'
import type { Id } from 'backend/convex/_generated/dataModel'
import { extractSources } from '@a/react/lib'
import { Source, Sources, SourcesContent, SourcesTrigger } from '@a/ui/components/ai-elements/sources'
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from '@a/ui/components/ai-elements/tool'
import { cn } from '@a/ui/lib/utils'
import { Fragment, memo } from 'react'
import { useMessagePartRegistry, useToolCard } from '../registries'
import { Actions } from './message-actions'
import { MessageReasoning } from './message-reasoning'
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
const PurePreviewMessage = ({ chatId, isLoading, message }: PreviewMessageProps) => {
  const ToolCard = useToolCard()
  const customRenderers = useMessagePartRegistry()
  return (
    <div className='group/message [content-visibility:auto] [contain-intrinsic-size:0_200px]'>
      {message.parts.map((part, index) => {
        const key = `${message.id}-part-${index}`
        const custom = customRenderers?.[part.type]
        if (custom) return <Fragment key={key}>{custom(part, { isLoading, message })}</Fragment>
        if (part.type === 'reasoning') return <MessageReasoning isLoading={isLoading} key={key} reasoning={part.text} />
        if (part.type === 'status') {
          const cls =
            part.tone === 'error'
              ? 'border-destructive/40 bg-destructive/5 text-destructive'
              : part.tone === 'warn'
                ? 'border-yellow-500/40 bg-yellow-500/5 text-yellow-700 dark:text-yellow-400'
                : 'border-border bg-muted text-muted-foreground'
          return (
            <div className={cn('my-2 rounded-md border px-3 py-2 text-xs flex items-center gap-2', cls)} key={key}>
              <span aria-hidden className='size-1.5 shrink-0 rounded-full bg-current animate-pulse' />
              <span className='truncate'>{part.text}</span>
            </div>
          )
        }
        if (part.type === 'text')
          return <MessageTextPart key={key} messageId={message.id} messageRole={message.role} text={part.text} />
        if (part.type === 'data-tool-x') {
          const toolNode = ToolCard ? ToolCard({ input: part.input, output: part.output }) : null
          if (toolNode) return <Fragment key={key}>{toolNode}</Fragment>
          return (
            <Tool key={key}>
              <ToolHeader state={part.state} toolName={part.toolName} type='dynamic-tool' />
              <ToolContent>
                {part.input ? <ToolInput input={part.input} /> : null}
                {part.output === undefined ? null : (
                  <ToolOutput errorText={undefined} output={formatOutput(part.output)} />
                )}
              </ToolContent>
            </Tool>
          )
        }
        if (part.type === 'data-sources') {
          const entries = sourcesEntriesFor(part.items)
          if (entries.length === 0) return null
          return (
            <Sources key={key}>
              <SourcesTrigger count={entries.length} />
              <SourcesContent>
                {entries.map(e => (
                  <Source href={e.url} key={e.url} title={`${e.domain} — ${e.title}`} />
                ))}
              </SourcesContent>
            </Sources>
          )
        }
        return (
          <pre className='text-xs opacity-70 overflow-x-auto' data-verbose='debug' key={key}>
            {formatOutput(part.value)}
          </pre>
        )
      })}
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
