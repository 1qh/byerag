'use client'
import type { ReactNode } from 'react'
import { createContext, use } from 'react'

const StarterPromptsContext = createContext<readonly string[] | undefined>(undefined)
StarterPromptsContext.displayName = 'StarterPromptsContext'
const StarterPromptsProvider = ({ children, prompts }: { children: ReactNode; prompts?: readonly string[] }) => (
  <StarterPromptsContext value={prompts}>{children}</StarterPromptsContext>
)
const useStarterPromptsCtx = (): readonly string[] | undefined => use(StarterPromptsContext)
export { StarterPromptsContext, StarterPromptsProvider, useStarterPromptsCtx }
