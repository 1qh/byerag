'use client'
import type { ReactNode } from 'react'
import { createContext, use } from 'react'
import type { MentionItem } from './mention-autocomplete'

const MentionItemsContext = createContext<MentionItem[] | undefined>(undefined)
const MentionItemsProvider = ({ children, items }: { children: ReactNode; items?: MentionItem[] }) => (
  <MentionItemsContext value={items}>{children}</MentionItemsContext>
)
const useMentionItemsCtx = (): MentionItem[] | undefined => use(MentionItemsContext)
export { MentionItemsContext, MentionItemsProvider, useMentionItemsCtx }
