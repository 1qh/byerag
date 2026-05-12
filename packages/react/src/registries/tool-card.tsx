'use client'
import type { ReactNode } from 'react'
import { createContext, use } from 'react'
type ToolCardComponent = (props: ToolCardProps) => ReactNode
interface ToolCardProps {
  input: unknown
  output: unknown
}
const ToolCardContext = createContext<null | ToolCardComponent>(null)
const ToolCardProvider = ({ children, value }: { children: ReactNode; value: ToolCardComponent }) => (
  <ToolCardContext value={value}>{children}</ToolCardContext>
)
const useToolCard = (): null | ToolCardComponent => use(ToolCardContext)
export { ToolCardProvider, useToolCard }
export type { ToolCardComponent, ToolCardProps }
