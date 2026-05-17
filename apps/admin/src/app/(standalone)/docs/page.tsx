'use client'
import type { Id } from 'backend/convex/_generated/dataModel'
import { DocUpload, DocViewer } from '@a/react/components'
import { cn } from '@a/ui'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@a/ui/components/alert-dialog'
import { Button } from '@a/ui/components/button'
import { Checkbox } from '@a/ui/components/checkbox'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@a/ui/components/resizable'
import { api } from 'backend/convex/_generated/api'
import { useMutation, useQuery } from 'convex/react'
import { FileText } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
const DocsPage = (): React.ReactElement => {
  const shared = useQuery(api.docs.listShared, {})
  const remove = useMutation(api.docs.adminDeleteDoc)
  const [selected, setSelected] = useState<Id<'docs'> | null>(null)
  const [checked, setChecked] = useState<Set<string>>(() => new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const toggle = (id: string): void =>
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const allIds = shared?.map(d => d._id) ?? []
  const allOn = allIds.length > 0 && allIds.every(i => checked.has(i))
  const toggleAll = (): void => setChecked(allOn ? new Set() : new Set(allIds))
  const runDelete = async (): Promise<void> => {
    setDeleting(true)
    const ids = [...checked]
    let ok = 0
    let fail = 0
    for (const id of ids)
      try {
        await remove({ docId: id as Id<'docs'> })
        ok += 1
      } catch (error: unknown) {
        fail += 1
        toast.error(`${id.slice(-6)}: ${String(error).slice(0, 80)}`)
      }
    toast.success(`Deleted ${ok}/${ids.length}${fail > 0 ? ` (${fail} failed)` : ''}`)
    if (selected && checked.has(selected)) setSelected(null)
    setChecked(new Set())
    setConfirmOpen(false)
    setDeleting(false)
  }
  return (
    <div className='h-dvh'>
      <ResizablePanelGroup direction='horizontal'>
        <ResizablePanel className='flex flex-col gap-4 overflow-hidden' defaultSize={30} maxSize={50} minSize={22}>
          <div className='space-y-2 border-b p-4'>
            <h2 className='font-semibold text-lg'>Shared corpus</h2>
            <DocUpload isAdmin scope='shared' />
          </div>
          {checked.size > 0 ? (
            <div className='sticky top-0 z-10 flex items-center gap-2 border-b bg-background px-4 py-2 text-sm'>
              <span className='flex-1 text-muted-foreground'>{checked.size} selected</span>
              <Button onClick={() => setConfirmOpen(true)} size='sm' variant='destructive'>
                Delete
              </Button>
              <Button onClick={() => setChecked(new Set())} size='sm' variant='ghost'>
                Clear
              </Button>
            </div>
          ) : null}
          <div className='flex items-center gap-2 px-4 text-muted-foreground text-xs'>
            <Checkbox aria-label='Select all' checked={allOn} disabled={allIds.length === 0} onCheckedChange={toggleAll} />
            <span>{allIds.length} docs</span>
          </div>
          <ul className='flex-1 space-y-1 overflow-auto px-2 pb-4 text-sm'>
            {shared?.map(d => {
              const id = d._id as string
              const isChecked = checked.has(id)
              return (
                <li className='flex items-center gap-2 rounded px-2 py-1 hover:bg-muted' key={d._id}>
                  <Checkbox aria-label={`Select ${d.filename}`} checked={isChecked} onCheckedChange={() => toggle(id)} />
                  <button
                    className={cn(
                      'flex-1 truncate text-left font-mono',
                      selected === d._id && 'font-semibold text-foreground'
                    )}
                    onClick={() => setSelected(d._id)}
                    type='button'>
                    {d.filename} <span className='text-muted-foreground'>v{d.version}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel className='overflow-auto' defaultSize={70}>
          {selected ? (
            <DocViewer docId={selected} />
          ) : (
            <div className='flex h-full flex-col items-center justify-center gap-3 text-muted-foreground'>
              <FileText aria-hidden className='size-10 opacity-40' />
              <p className='font-medium'>Select a document to preview</p>
              <p className='text-sm'>Pick a file on the left, or upload one to the shared corpus.</p>
            </div>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
      <AlertDialog onOpenChange={setConfirmOpen} open={confirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {checked.size} doc{checked.size === 1 ? '' : 's'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Soft-delete removes them from the corpus and cascades to pending question suggestions + approved questions.
              Blobs hard-purge after 30 days. This cannot be undone via the UI.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={e => {
                e.preventDefault()
                // oxlint-disable-next-line promise/prefer-await-to-then, promise/prefer-await-to-callbacks -- React handler
                runDelete().catch((error: unknown) => toast.error(String(error)))
              }}>
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
export default DocsPage
