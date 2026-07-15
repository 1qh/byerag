'use client'
import type { Id } from 'backend/convex/_generated/dataModel'
import type { ReactNode } from 'react'
import { createContext, use } from 'react'

type VoteFn = (args: { chatId: Id<'chats'>; isUpvoted: boolean; messageId: Id<'messages'> }) => Promise<unknown>
const FeedbackContext = createContext<undefined | VoteFn>(undefined)
FeedbackContext.displayName = 'FeedbackContext'
const FeedbackProvider = ({ children, vote }: { children: ReactNode; vote?: VoteFn }) => (
  <FeedbackContext value={vote}>{children}</FeedbackContext>
)
const useFeedbackCtx = (): undefined | VoteFn => use(FeedbackContext)
export { FeedbackContext, FeedbackProvider, useFeedbackCtx }
export type { VoteFn }
