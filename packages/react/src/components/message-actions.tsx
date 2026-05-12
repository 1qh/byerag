/* oxlint-disable promise/prefer-await-to-then */
'use client'
import type { UIMessage } from '@a/react/lib'
import type { Id } from 'backend/convex/_generated/dataModel'
import { cn } from '@a/ui'
import { MessageAction, MessageActions } from '@a/ui/components/ai-elements/message'
import { Copy, ThumbsDown, ThumbsUp } from 'lucide-react'
import { memo, useState } from 'react'
import { toast } from 'sonner'
import { useFeedbackCtx } from './feedback-context'
interface ActionsProps {
  chatId?: Id<'chats'> | null
  isLoading: boolean
  message: UIMessage
}
const textOf = (m: UIMessage): string =>
  m.parts
    .filter(p => p.type === 'text')
    .map(p => ('text' in p ? p.text : ''))
    .join('\n')
    .trim()
const copyText = (text: string): void => {
  if (!text) {
    toast.error("There's no text to copy!")
    return
  }
  globalThis.navigator.clipboard
    .writeText(text)
    .then(() => toast.success('Copied to clipboard!'))
    .catch(() => toast.error('Copy failed'))
}
const PureActions = ({ chatId, isLoading, message }: ActionsProps) => {
  const vote = useFeedbackCtx()
  const [voted, setVoted] = useState<'down' | 'up' | null>(null)
  if (isLoading) return null
  const text = textOf(message)
  if (!text) return null
  const onVote = (isUp: boolean): void => {
    if (!(vote && chatId)) return
    setVoted(isUp ? 'up' : 'down')
    vote({ chatId, isUpvoted: isUp, messageId: message.id as Id<'messages'> })
      .then(() => toast.success(isUp ? 'Thanks for the upvote!' : 'Noted, we’ll improve.'))
      .catch(() => {
        setVoted(null)
        toast.error('Vote failed')
      })
  }
  return (
    <MessageActions className='-ml-1 gap-0 -space-x-1 opacity-0 group-hover/message:opacity-100 focus-within:opacity-100 transition-opacity'>
      <MessageAction label='Copy' onClick={() => copyText(text)}>
        <Copy />
      </MessageAction>
      {vote && chatId ? (
        <>
          <MessageAction label='Upvote' onClick={() => onVote(true)}>
            <ThumbsUp className={cn(voted === 'up' && 'text-emerald-600')} />
          </MessageAction>
          <MessageAction label='Downvote' onClick={() => onVote(false)}>
            <ThumbsDown className={cn(voted === 'down' && 'text-rose-600')} />
          </MessageAction>
        </>
      ) : null}
    </MessageActions>
  )
}
const Actions = memo(
  PureActions,
  (prev, next) => prev.isLoading === next.isLoading && prev.message.id === next.message.id && prev.chatId === next.chatId
)
export { Actions }
