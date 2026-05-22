'use client'
import type { Id } from 'backend/convex/_generated/dataModel'
import { Sheet, SheetContent } from '@a/ui/components/sheet'
import { useState } from 'react'
import { useDocSheet } from './doc-sheet-context'
import { DocViewer } from './doc-viewer'

const clampW = (n: number): number => Math.min(1100, Math.max(360, n))
const DocSheet = (): null | React.ReactElement => {
  const { docId, close } = useDocSheet()
  const open = docId !== null
  const [width, setWidth] = useState(672)
  const startResize = (e: React.PointerEvent): void => {
    e.preventDefault()
    const startX = e.clientX
    const startW = width
    const move = (ev: PointerEvent): void => setWidth(clampW(startW - (ev.clientX - startX)))
    const up = (): void => {
      globalThis.removeEventListener('pointermove', move)
      globalThis.removeEventListener('pointerup', up)
    }
    globalThis.addEventListener('pointermove', move)
    globalThis.addEventListener('pointerup', up)
  }
  return (
    <Sheet
      modal={false}
      onOpenChange={next => {
        if (!next) close()
      }}
      open={open}>
      <SheetContent
        className='overflow-auto'
        side='right'
        // oxlint-disable-next-line react-perf/jsx-no-new-object-as-prop -- width is stateful
        style={{ maxWidth: 'none', width: `${width}px` }}>
        <button
          aria-label='Resize preview'
          className='absolute top-0 left-0 h-full w-1 cursor-col-resize bg-border hover:bg-primary/40'
          onPointerDown={startResize}
          type='button'
        />
        {docId ? <DocViewer docId={docId as Id<'docs'>} /> : null}
      </SheetContent>
    </Sheet>
  )
}
export { DocSheet }
