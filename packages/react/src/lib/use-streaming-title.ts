'use client'
import { useEffect } from 'react'
import { useChatList } from './use-chat-list'

const DOT_PREFIX_RE = /^● /u
const stripDot = (s: string): string => s.replace(DOT_PREFIX_RE, '')
const useStreamingTitle = (): void => {
  const chats = useChatList()
  const anyStreaming = (chats ?? []).some(c => c.streaming)
  useEffect(() => {
    const base = stripDot(globalThis.document.title)
    globalThis.document.title = anyStreaming ? `● ${base}` : base
  }, [anyStreaming])
}
export { useStreamingTitle }
