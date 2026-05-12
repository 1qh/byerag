'use client'
import type { ReactNode } from 'react'
import { createContext, use } from 'react'
import type { UIMessage, UIPart } from '../lib'
interface MessagePartCtx {
  isLoading: boolean
  message: UIMessage
}
type MessagePartRegistryMap = Readonly<Record<string, MessagePartRenderer>>
type MessagePartRenderer = (part: UIPart, ctx: MessagePartCtx) => ReactNode
const MessagePartRegistryContext = createContext<MessagePartRegistryMap | null>(null)
const MessagePartRegistry = ({ children, value }: { children: ReactNode; value: MessagePartRegistryMap }) => (
  <MessagePartRegistryContext value={value}>{children}</MessagePartRegistryContext>
)
const useMessagePartRegistry = (): MessagePartRegistryMap | null => use(MessagePartRegistryContext)
export { MessagePartRegistry, useMessagePartRegistry }
export type { MessagePartCtx, MessagePartRegistryMap, MessagePartRenderer }
