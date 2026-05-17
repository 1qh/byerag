'use client'
import type { Id } from 'backend/convex/_generated/dataModel'
import { Sheet, SheetContent } from '@a/ui/components/sheet'
import { useDocSheet } from './doc-sheet-context'
import { DocViewer } from './doc-viewer'
const DocSheet = (): null | React.ReactElement => {
  const { docId, close } = useDocSheet()
  const open = docId !== null
  return (
    <Sheet modal={false} onOpenChange={next => !next && close()} open={open}>
      <SheetContent className='w-full overflow-auto sm:max-w-2xl' side='right'>
        {docId ? <DocViewer docId={docId as Id<'docs'>} /> : null}
      </SheetContent>
    </Sheet>
  )
}
export { DocSheet }
