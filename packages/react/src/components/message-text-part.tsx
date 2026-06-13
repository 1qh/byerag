/** biome-ignore-all lint/nursery/noUndeclaredClasses: standard tailwind v4 utilities biome cannot resolve */
'use client'
import type { ComponentProps } from 'react'
import { cn } from '@a/ui'
import { Message, MessageResponse } from '@a/ui/components/ai-elements/message'
import { memo } from 'react'
import { CitationAnchor } from './citation-anchor'
import { MentionChip } from './mention-chip'
import { useMentionItemsCtx } from './mention-items-context'
import { usePane } from './pane'

const PERSISTENT_USER_KINDS = new Set([
  'bookmark',
  'collection',
  'corridor',
  'knowledge',
  'monitor',
  'product',
  'reminder',
  'template'
])
const MENTION_RE = /(?<!\S)@(?<kind>[a-z]+)(?::(?<name>[^\s)]*))?/giu
const MENTION_INNER_RE = /@(?<kind>[a-z]+)(?::(?<name>[^\s)]*))?/u
const SINGLETONS = new Set(['me'])
const linkifyMentions = (text: string): string =>
  text.replaceAll(MENTION_RE, raw => {
    const m = MENTION_INNER_RE.exec(raw)
    const kind = m?.groups?.kind ?? ''
    const name = m?.groups?.name
    if (!SINGLETONS.has(kind) && (!name || name.length === 0)) return raw
    const safe = name ? encodeURIComponent(name) : ''
    return `[${raw}](mention://${kind}${name ? `/${safe}` : ''})`
  })
const MentionAnchor = ({ href, children }: ComponentProps<'a'>) => {
  const pane = usePane()
  const items = useMentionItemsCtx()
  if (typeof href === 'string' && href.startsWith('/docs/')) return <CitationAnchor href={href}>{children}</CitationAnchor>
  if (typeof href === 'string' && href.startsWith('mention://')) {
    const stripped = href.slice('mention://'.length)
    const slash = stripped.indexOf('/')
    const kind = slash === -1 ? stripped : stripped.slice(0, slash)
    const name = slash === -1 ? undefined : decodeURIComponent(stripped.slice(slash + 1))
    const tombstone =
      name && PERSISTENT_USER_KINDS.has(kind) && Array.isArray(items)
        ? !items.some(it => it.kind === kind && it.name === name)
        : false
    return (
      <MentionChip
        kind={kind}
        name={name}
        onClick={
          tombstone
            ? undefined
            : () => pane.openSubject({ breadcrumb: name ? `@${kind}:${name}` : `@${kind}`, kind, payload: { kind, name } })
        }
        tombstone={tombstone}
      />
    )
  }
  return <a href={href}>{children}</a>
}
const MENTION_COMPONENTS = { a: MentionAnchor }
interface MessageTextPartProps {
  messageId: string
  messageRole: 'assistant' | 'user'
  text: string
}
const PureMessageTextPart = ({ messageId, messageRole, text }: MessageTextPartProps) => {
  if (!text.trim()) return null
  const key = `message-${messageId}-part`
  const linkified = linkifyMentions(text)
  return (
    <Message className={cn(messageRole === 'user' && 'mb-2')} from={messageRole} key={key}>
      {messageRole === 'user' ? (
        <MessageResponse
          className='ml-auto w-fit max-w-lg rounded-3xl border bg-muted px-4 py-2.5 text-balance'
          components={MENTION_COMPONENTS}>
          {linkified}
        </MessageResponse>
      ) : (
        <MessageResponse className='w-full' components={MENTION_COMPONENTS}>
          {linkified}
        </MessageResponse>
      )}
    </Message>
  )
}
const MessageTextPart = memo(
  PureMessageTextPart,
  (prev, next) => prev.text === next.text && prev.messageId === next.messageId && prev.messageRole === next.messageRole
)
export { linkifyMentions, MessageTextPart }
