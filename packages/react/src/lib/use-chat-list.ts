'use client'
import type { FunctionReturnType } from 'convex/server'
import { api } from 'backend/convex/_generated/api'
import { useQuery } from 'convex/react'
import { useEffect, useMemo } from 'react'
import { useApp } from '../app-context'
type ChatRow = FunctionReturnType<typeof api.chats.list>[number]
const KEY_PREFIX = 'chatsList.v1.'
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const readCache = (key: string): ChatRow[] | undefined => {
  try {
    const raw = globalThis.localStorage.getItem(key)
    if (!raw) return
    const parsed = JSON.parse(raw) as { at: number; rows: ChatRow[] }
    if (Date.now() - parsed.at > MAX_AGE_MS) return
    return parsed.rows
  } catch {
    /* Parse / access — ignore */
  }
}
const writeCache = (key: string, rows: readonly ChatRow[]): void => {
  try {
    globalThis.localStorage.setItem(key, JSON.stringify({ at: Date.now(), rows }))
  } catch {
    /* Quota / disabled — ignore */
  }
}
const useChatList = (): ChatRow[] | undefined => {
  const { id: app } = useApp()
  const key = `${KEY_PREFIX}${app}`
  const live = useQuery(api.chats.list, { app })
  const snapshot = useMemo<ChatRow[] | undefined>(() => readCache(key), [key])
  useEffect(() => {
    if (live) writeCache(key, live)
  }, [key, live])
  return live ?? snapshot
}
export { useChatList }
export type { ChatRow }
