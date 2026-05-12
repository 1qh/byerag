'use client'
import type { Id } from 'backend/convex/_generated/dataModel'
import type { ReactNode } from 'react'
import { createContext, use, useMemo } from 'react'
interface AppCallbacks {
  onChatCreate?: (chatId: Id<'chats'>) => void
  onError?: (error: Error) => void
  onSend?: (text: string) => void
  onStreamEnd?: (chatId: Id<'chats'>) => void
}
interface AppCtx {
  callbacks: AppCallbacks
  id: string
}
const AppContext = createContext<AppCtx | null>(null)
const EMPTY: AppCallbacks = {}
const AppProvider = ({ appId, callbacks, children }: { appId: string; callbacks?: AppCallbacks; children: ReactNode }) => {
  const value = useMemo<AppCtx>(() => ({ callbacks: callbacks ?? EMPTY, id: appId }), [appId, callbacks])
  return <AppContext value={value}>{children}</AppContext>
}
const useApp = (): AppCtx => {
  const ctx = use(AppContext)
  if (!ctx) throw new Error('useApp called outside <AppProvider>')
  return ctx
}
const useAppCallbacks = (): AppCallbacks => useApp().callbacks
export { AppProvider, useApp, useAppCallbacks }
export type { AppCallbacks }
