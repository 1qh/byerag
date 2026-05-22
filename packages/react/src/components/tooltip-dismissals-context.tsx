'use client'
import type { ReactNode } from 'react'
import { createContext, use } from 'react'

interface TooltipDismissalsValue {
  dismiss: (key: string) => void
  dismissed: readonly string[]
}
const TooltipDismissalsContext = createContext<TooltipDismissalsValue | undefined>(undefined)
const TooltipDismissalsProvider = ({ children, value }: { children: ReactNode; value?: TooltipDismissalsValue }) => (
  <TooltipDismissalsContext value={value}>{children}</TooltipDismissalsContext>
)
const useTooltipDismissalsCtx = (): TooltipDismissalsValue | undefined => use(TooltipDismissalsContext)
export { TooltipDismissalsContext, TooltipDismissalsProvider, useTooltipDismissalsCtx }
export type { TooltipDismissalsValue }
