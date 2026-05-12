/* oxlint-disable promise/prefer-await-to-then */
'use client'
import type { ReactNode } from 'react'
import { useState } from 'react'
interface TosOverlayProps {
  agreed: boolean | undefined
  onAccept: () => Promise<unknown>
  text: ReactNode
  title?: string
}
const TosOverlay = ({ agreed, onAccept, text, title = 'Terms of Service' }: TosOverlayProps) => {
  const [pending, setPending] = useState(false)
  if (agreed !== false) return null
  const accept = (): void => {
    setPending(true)
    onAccept().catch(() => {
      setPending(false)
    })
  }
  return (
    <dialog className='fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm' open>
      <div className='max-w-md rounded-lg border border-border bg-card p-6 shadow-lg'>
        <h2 className='text-lg font-semibold mb-3'>{title}</h2>
        <div className='text-sm text-muted-foreground mb-4 max-h-64 overflow-auto'>{text}</div>
        <button
          className='rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50'
          disabled={pending}
          onClick={accept}
          type='button'>
          {pending ? 'Accepting…' : 'I accept'}
        </button>
      </div>
    </dialog>
  )
}
export { TosOverlay }
export type { TosOverlayProps }
