import type { Id } from 'backend/convex/_generated/dataModel'
import type { UIMessage } from './ui-messages'

type ChatIdOrNull = Id<'chats'> | null
type ChatState =
  | { assistantHasText: boolean; chatId: Id<'chats'>; kind: 'streaming' }
  | { chatId: ChatIdOrNull; error: string; kind: 'error'; text: string }
  | { chatId: ChatIdOrNull; kind: 'submitting'; text: string }
  | { chatId: Id<'chats'>; kind: 'idle' }
  | { kind: 'empty' }
interface DeriveInput {
  activeChatId: ChatIdOrNull
  isMutationPending: boolean
  isStreaming: boolean
  lastError?: null | string
  messages: readonly UIMessage[]
  pendingTexts: readonly PendingText[]
}
interface PendingText {
  chatId: ChatIdOrNull
  text: string
}
const pendingForChat = (p: readonly PendingText[], chatId: ChatIdOrNull): PendingText | undefined =>
  p.find(t => t.chatId === chatId)
const lastMessage = (m: readonly UIMessage[]): UIMessage | undefined => m.at(-1)
const assistantHasVisibleText = (m: readonly UIMessage[]): boolean => {
  const last = lastMessage(m)
  if (last?.role !== 'assistant') return false
  return last.parts.some(p => p.type === 'text' && p.text.trim() !== '')
}
const deriveChatState = (input: DeriveInput): ChatState => {
  const { activeChatId, isMutationPending, isStreaming, lastError, messages, pendingTexts } = input
  const myPending = pendingForChat(pendingTexts, activeChatId)
  if (lastError && myPending) return { chatId: activeChatId, error: lastError, kind: 'error', text: myPending.text }
  if (isMutationPending && myPending) return { chatId: activeChatId, kind: 'submitting', text: myPending.text }
  if (activeChatId && isStreaming)
    return { assistantHasText: assistantHasVisibleText(messages), chatId: activeChatId, kind: 'streaming' }
  if (activeChatId && myPending)
    return { assistantHasText: assistantHasVisibleText(messages), chatId: activeChatId, kind: 'streaming' }
  if (activeChatId && messages.length > 0) return { chatId: activeChatId, kind: 'idle' }
  return { kind: 'empty' }
}
const ROUTE_CHAT_RE = /^\/chat\/(?<id>[^/?#]+)/u
const routeChatId = (pathname: null | string): null | string => {
  if (!pathname) return null
  return ROUTE_CHAT_RE.exec(pathname)?.groups?.id ?? null
}
const validCreatedChatId = (createdChatId: ChatIdOrNull, pathname: null | string): ChatIdOrNull =>
  createdChatId && pathname === `/chat/${createdChatId}` ? createdChatId : null
const filterLivePending = (
  pendingTexts: readonly PendingText[],
  activeChatId: ChatIdOrNull,
  rawUserTexts: ReadonlySet<string>
): readonly PendingText[] => pendingTexts.filter(p => !(p.chatId === activeChatId && rawUserTexts.has(p.text)))
export { deriveChatState, filterLivePending, routeChatId, validCreatedChatId }
export type { ChatIdOrNull, ChatState, DeriveInput, PendingText }
