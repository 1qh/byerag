/** biome-ignore-all lint/nursery/noUndeclaredClasses: standard tailwind v4 utilities biome cannot resolve */
'use client'
import type { ReactNode } from 'react'
import { Button } from '@a/ui/components/button'
import { useState } from 'react'
import { useTooltipDismissalsCtx } from './tooltip-dismissals-context'

const initialOpenLocal = (storageKey: string): boolean => {
  try {
    return globalThis.localStorage.getItem(storageKey) !== 'shown'
  } catch {
    return false
  }
}
const markDismissedLocal = (storageKey: string): void => {
  try {
    globalThis.localStorage.setItem(storageKey, 'shown')
  } catch {
    /* No-op */
  }
}
interface OneShotTooltipProps {
  children: ReactNode
  storageKey: string
}
const OneShotTooltip = ({ children, storageKey }: OneShotTooltipProps) => {
  const ctx = useTooltipDismissalsCtx()
  const [localOpen, setLocalOpen] = useState(() => (ctx ? true : initialOpenLocal(storageKey)))
  const dismissedByCtx = ctx?.dismissed.includes(storageKey) ?? false
  const open = ctx ? !dismissedByCtx && localOpen : localOpen
  const dismiss = (): void => {
    if (ctx) ctx.dismiss(storageKey)
    else markDismissedLocal(storageKey)
    setLocalOpen(false)
  }
  if (!open) return null
  return (
    <dialog
      className='absolute z-40 max-w-sm rounded-lg border border-primary/40 bg-popover px-4 py-3 text-xs shadow-md'
      open>
      <div className='space-y-2'>
        <div>{children}</div>
        <Button
          className='h-auto rounded-md border border-border/60 bg-background/50 px-3 py-1 text-[11px] hover:bg-accent'
          onClick={dismiss}
          size='sm'
          type='button'
          variant='ghost'>
          Got it
        </Button>
      </div>
    </dialog>
  )
}
export { OneShotTooltip }
export type { OneShotTooltipProps }
