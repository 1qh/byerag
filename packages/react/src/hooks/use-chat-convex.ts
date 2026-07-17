'use client'
import type { Id } from 'backend/convex/_generated/dataModel'
import { api } from 'backend/convex/_generated/api'
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import type { ChatState, PendingText } from '../lib/chat-state'
import type { UIMessage } from '../lib/ui-messages'
import { useApp } from '../app-context'
import {
  deriveChatState,
  filterLivePending,
  routeChatId as parseRouteChatId,
  validCreatedChatId as resolveValidCreated
} from '../lib/chat-state'
import { errorMessage } from '../lib/error-message'
import { chunksToMessages } from '../lib/ui-messages'
import { parseWithCache, sourceToChunks } from '../parsers/chunks'

type Status = 'error' | 'ready' | 'streaming' | 'submitted'
interface StreamMsg {
  _creationTime: number
  _id: string
  content: string
}
interface UseChatResult {
  activeChatId: Id<'chats'> | null
  deleteChat: (id: Id<'chats'>) => Promise<void>
  exportEvents: StreamMsg[]
  loadMore: (n: number) => void
  messages: UIMessage[]
  paginationStatus: 'CanLoadMore' | 'Exhausted' | 'LoadingFirstPage' | 'LoadingMore'
  regenerate: () => void
  sendMessage: (text: string) => void
  state: ChatState
  status: Status
  stop: () => Promise<void>
  streamEvents: StreamMsg[]
  title: string
}
const assignPendingChatId = (pending: PendingText[], text: string, id: Id<'chats'>): PendingText[] =>
  pending.map(p => (p.chatId === null && p.text === text ? { chatId: id, text } : p))
const useChatConvex = ({ chatId }: { chatId: Id<'chats'> | null }): UseChatResult => {
  const { callbacks, id: app } = useApp()
  const pathname = usePathname()
  const routeChatId = parseRouteChatId(pathname) as Id<'chats'> | null
  const [createdChatId, setCreatedChatId] = useState<Id<'chats'> | null>(null)
  const validCreatedChatId = resolveValidCreated(createdChatId, pathname)
  const activeChatId = chatId ?? routeChatId ?? validCreatedChatId ?? null
  const {
    loadMore,
    results: rawMessagesDesc,
    status: paginationStatus
  } = usePaginatedQuery(api.messages.list, activeChatId ? { chatId: activeChatId } : 'skip', { initialNumItems: 100 })
  const rawMessages = useMemo(() => [...rawMessagesDesc].toReversed(), [rawMessagesDesc])
  const chatStatus = useQuery(api.chats.status, activeChatId ? { chatId: activeChatId } : 'skip')
  const streamEventsQuery = useQuery(
    api.messages.streamEvents,
    activeChatId && chatStatus?.streaming !== false ? { chatId: activeChatId } : 'skip'
  )
  const send = useMutation(api.messages.send)
  const abortMut = useMutation(api.chats.abort)
  const removeMut = useMutation(api.chats.remove)
  const [isPending, startTransition] = useTransition()
  const inFlightRef = useRef(false)
  const title = chatStatus?.title && chatStatus.title !== '' ? chatStatus.title : 'chat'
  const sortedEvents = useMemo(() => [...(streamEventsQuery ?? [])].toSorted((a, b) => a.seq - b.seq), [streamEventsQuery])
  const isStreaming = chatStatus?.streaming ?? false
  const [pendingTexts, setPendingTexts] = useState<PendingText[]>([])
  const rawUserTexts = useMemo(() => {
    const out = new Set<string>()
    for (const r of rawMessages) {
      const p = parseWithCache(r)
      const content = p?.type === 'user' ? p.message?.content : null
      if (Array.isArray(content)) {
        const txt = content.map(b => (typeof b.text === 'string' ? b.text : '')).join('\n')
        if (txt.trim()) out.add(txt)
      }
    }
    return out
  }, [rawMessages])
  const livePendingTexts = useMemo(
    () => filterLivePending(pendingTexts, activeChatId, rawUserTexts),
    [pendingTexts, activeChatId, rawUserTexts]
  )
  const combinedMessages = useMemo(() => {
    const relevant = livePendingTexts.filter(p => p.chatId === activeChatId)
    if (relevant.length === 0) return rawMessages
    return [
      ...rawMessages,
      ...relevant.map((p, i) => ({
        _creationTime: 0,
        _id: `pending-${i}`,
        content: JSON.stringify({ message: { content: [{ text: p.text, type: 'text' }], role: 'user' }, type: 'user' })
      }))
    ]
  }, [rawMessages, livePendingTexts, activeChatId])
  const chunks = useMemo(
    () => sourceToChunks([...combinedMessages, ...(isStreaming ? sortedEvents : [])]),
    [combinedMessages, sortedEvents, isStreaming]
  )
  const messages = useMemo(() => chunksToMessages(chunks), [chunks])
  const exportEvents = useMemo(() => [...combinedMessages, ...sortedEvents], [combinedMessages, sortedEvents])
  const [lastError, setLastError] = useState<null | string>(null)
  const sendMessage = (text: string): void => {
    if (inFlightRef.current) {
      toast.error('Already sending a message')
      return
    }
    if (isStreaming) {
      toast.error('Please wait for the current response to finish')
      return
    }
    inFlightRef.current = true
    callbacks.onSend?.(text)
    const submittedChatId = activeChatId
    setPendingTexts(prev => [...prev, { chatId: submittedChatId, text }])
    startTransition(async () => {
      try {
        const id = await send({ app, chatId: submittedChatId ?? undefined, content: text })
        setLastError(null)
        if (!submittedChatId) {
          callbacks.onChatCreate?.(id)
          setCreatedChatId(id)
          setPendingTexts(prev => assignPendingChatId(prev, text, id))
          globalThis.window.history.replaceState(null, '', `/chat/${id}`)
        }
      } catch (caughtError: unknown) {
        const msg = errorMessage(caughtError)
        setLastError(msg)
        callbacks.onError?.(caughtError instanceof Error ? caughtError : new Error(msg))
        toast.error(msg, {
          action: { label: 'Retry', onClick: () => sendMessage(text) },
          duration: 8000
        })
      } finally {
        inFlightRef.current = false
      }
    })
  }
  const wasStreamingRef = useRef(false)
  useEffect(() => {
    if (wasStreamingRef.current && !isStreaming && activeChatId) callbacks.onStreamEnd?.(activeChatId)
    wasStreamingRef.current = isStreaming
  }, [isStreaming, activeChatId, callbacks])
  const lastUserText = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i]
      if (m?.role === 'user') {
        const txt = m.parts
          .filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
          .map(p => p.text)
          .join('\n')
        if (txt.trim()) return txt
      }
    }
    return null
  }, [messages])
  const stop = async (): Promise<void> => {
    if (!activeChatId) return
    await abortMut({ app, chatId: activeChatId })
  }
  const deleteChat = async (id: Id<'chats'>): Promise<void> => {
    await removeMut({ app, chatId: id })
  }
  const regenerate = (): void => {
    if (!lastUserText) return
    sendMessage(lastUserText)
  }
  let status: Status
  if (isStreaming) status = 'streaming'
  else if (isPending) status = 'submitted'
  else status = 'ready'
  const state = useMemo(
    () =>
      deriveChatState({
        activeChatId,
        isMutationPending: isPending,
        isStreaming,
        lastError,
        messages,
        pendingTexts: livePendingTexts
      }),
    [activeChatId, isPending, isStreaming, lastError, messages, livePendingTexts]
  )
  return {
    activeChatId,
    deleteChat,
    exportEvents,
    loadMore,
    messages,
    paginationStatus,
    regenerate,
    sendMessage,
    state,
    status,
    stop,
    streamEvents: sortedEvents,
    title
  }
}
export { useChatConvex }
export type { Status, UseChatResult }
