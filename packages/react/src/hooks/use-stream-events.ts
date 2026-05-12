'use client'
import type { Id } from 'backend/convex/_generated/dataModel'
import { api } from 'backend/convex/_generated/api'
import { useQuery } from 'convex/react'
import { useMemo } from 'react'
interface StreamRow {
  _id: string
  content: string
  seq: number
}
const useStreamEvents = <T>(chatId: null | string, accumulate: (events: StreamRow[]) => T, fallback: T): T => {
  const events = useQuery(api.messages.streamEvents, chatId ? { chatId: chatId as Id<'chats'> } : 'skip')
  return useMemo<T>(() => {
    if (!events) return fallback
    return accumulate(events)
  }, [events, accumulate, fallback])
}
export { useStreamEvents }
export type { StreamRow }
