'use client'
import type { ReactNode } from 'react'
import { createContext, use } from 'react'

interface BusyState {
  lockedReason: null | string
  onStop: (() => void) | null
}
const BusyContext = createContext<BusyState>({ lockedReason: null, onStop: null })
BusyContext.displayName = 'BusyContext'
const BusyProvider = ({ children, value }: { children: ReactNode; value: BusyState }) => (
  <BusyContext value={value}>{children}</BusyContext>
)
const useBusyState = (): BusyState => use(BusyContext)
export { BusyProvider, useBusyState }
