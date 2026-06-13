/** biome-ignore-all lint/nursery/noUndeclaredClasses: standard tailwind v4 utilities biome cannot resolve */
'use client'
import type { Status } from '@a/react/hooks'
import type { UIMessage } from '@a/react/lib'
import type { Id } from 'backend/convex/_generated/dataModel'
import { Conversation, ConversationContent, ConversationScrollButton } from '@a/ui/components/ai-elements/conversation'
import { Shimmer } from '@a/ui/components/ai-elements/shimmer'
import { PreviewMessage } from './message'

interface MessagesProps {
  awaitingAssistant: boolean
  chatId?: Id<'chats'> | null
  messages: UIMessage[]
  status: Status
}
const Messages = ({ awaitingAssistant, chatId, messages, status }: MessagesProps) => (
  <Conversation>
    <ConversationContent
      aria-live='polite'
      aria-relevant='additions text'
      className='mx-auto mt-8 max-w-4xl gap-0 px-2 py-5'
      role='log'>
      {messages.map((m, index) => {
        const isLast = messages.length - 1 === index
        const streaming = status === 'streaming' && isLast
        return <PreviewMessage chatId={chatId} isLoading={streaming} key={m.id} message={m} />
      })}
      {awaitingAssistant ? (
        <div className='px-4 py-2'>
          <Shimmer duration={1}>Thinking...</Shimmer>
        </div>
      ) : null}
    </ConversationContent>
    <ConversationScrollButton />
  </Conversation>
)
export { Messages }
