/* eslint-disable no-await-in-loop */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential mutations */
'use client'
import type { Id } from 'backend/convex/_generated/dataModel'
import { useDocSheet } from '@a/react/components'
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
import { api } from 'backend/convex/_generated/api'
import { useMutation, useQuery } from 'convex/react'
import { RotateCcw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

const pad2 = (n: number): string => String(n).padStart(2, '0')
const fmtVN = (ms: number): string => {
  const v = new Date(ms + 7 * 3_600_000)
  return `${v.getUTCFullYear()}-${pad2(v.getUTCMonth() + 1)}-${pad2(v.getUTCDate())} ${pad2(v.getUTCHours())}:${pad2(v.getUTCMinutes())} VN`
}
const DeletedDocsPage = (): React.ReactElement => {
  const rows = useQuery(api.docs.listDeleted, {})
  const restore = useMutation(api.docs.adminRestoreDoc)
  const purge = useMutation(api.docs.adminPurgeDoc)
  const { openDoc } = useDocSheet()
  const [checked, setChecked] = useState<Set<string>>(() => new Set())
  const [running, setRunning] = useState<'purge' | 'restore' | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const toggle = (id: string): void =>
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const allIds = rows?.map(r => r._id) ?? []
  const allOn = allIds.length > 0 && allIds.every(i => checked.has(i))
  const toggleAll = (): void => setChecked(allOn ? new Set() : new Set(allIds))
  const renderList = (): React.ReactElement => {
    if (rows === undefined) return <div className='p-4 text-muted-foreground text-sm'>Loading…</div>
    if (rows.length === 0) return <div className='p-4 text-muted-foreground text-sm'>No deleted documents.</div>
    return (
      <ul className='flex-1 space-y-1 overflow-auto p-2 text-sm'>
        {rows.map(r => {
          const id = r._id as string
          const isChecked = checked.has(id)
          return (
            <li className='flex items-center gap-2 rounded px-2 py-1 hover:bg-muted' key={r._id}>
              <Checkbox aria-label={`Select ${r.filename}`} checked={isChecked} onCheckedChange={() => toggle(id)} />
              <button className='min-w-0 flex-1 text-left' onClick={() => openDoc(r._id)} type='button'>
                <span className='block truncate'>
                  {r.filename} <span className='text-muted-foreground text-xs'>v{r.version}</span>
                </span>
                <span className='text-muted-foreground text-xs'>
                  {r.scope} · deleted {fmtVN(r.deletedAt)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    )
  }
  const runRestore = async (): Promise<void> => {
    setRunning('restore')
    const ids = [...checked]
    let ok = 0
    let fail = 0
    for (const id of ids)
      try {
        await restore({ docId: id as Id<'docs'> })
        ok += 1
      } catch (error: unknown) {
        fail += 1
        toast.error(`${id.slice(-6)}: ${String(error).slice(0, 80)}`)
      }
    const failSuffix = fail > 0 ? ` (${fail} failed)` : ''
    toast.success(`Restored ${ok}/${ids.length}${failSuffix}`)
    setChecked(new Set())
    setRunning(null)
  }
  const runPurge = async (): Promise<void> => {
    setRunning('purge')
    const ids = [...checked]
    let ok = 0
    let fail = 0
    for (const id of ids)
      try {
        await purge({ docId: id as Id<'docs'> })
        ok += 1
      } catch (error: unknown) {
        fail += 1
        toast.error(`${id.slice(-6)}: ${String(error).slice(0, 80)}`)
      }
    const failSuffix = fail > 0 ? ` (${fail} failed)` : ''
    toast.success(`Permanently deleted ${ok}/${ids.length}${failSuffix}`)
    setChecked(new Set())
    setConfirmOpen(false)
    setRunning(null)
  }
  return (
    <div className='mx-auto flex h-dvh w-full max-w-3xl flex-col'>
      <div className='flex items-center gap-2 border-b p-4'>
        <Trash2 aria-hidden className='size-5 text-muted-foreground' />
        <h1 className='font-semibold text-lg'>Trash</h1>
      </div>
      <p className='border-b p-4 text-muted-foreground text-xs'>
        Excluded from agent retrieval. Blobs hard-purge 30 days after deletion; restore before then to bring a doc back
        into the corpus.
      </p>
      {rows && rows.length > 0 ? (
        <div className='flex items-center gap-2 border-b bg-background px-4 py-2 text-sm'>
          <Checkbox aria-label='Select all' checked={allOn} disabled={allIds.length === 0} onCheckedChange={toggleAll} />
          <span className='text-muted-foreground text-xs'>
            {checked.size > 0 ? `${checked.size} selected` : `${allIds.length} in trash`}
          </span>
          {checked.size > 0 ? (
            <>
              <Button
                className='ml-auto'
                disabled={running !== null}
                onClick={() => {
                  // oxlint-disable-next-line promise/prefer-await-to-then, promise/prefer-await-to-callbacks -- React handler
                  runRestore().catch((error: unknown) => toast.error(String(error)))
                }}
                size='sm'
                variant='outline'>
                <RotateCcw className='size-4' />
                {running === 'restore' ? 'Restoring…' : 'Restore'}
              </Button>
              <Button disabled={running !== null} onClick={() => setConfirmOpen(true)} size='sm' variant='destructive'>
                <Trash2 className='size-4' />
                Delete permanently
              </Button>
              <Button disabled={running !== null} onClick={() => setChecked(new Set())} size='sm' variant='ghost'>
                Clear
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
      {renderList()}
      <AlertDialog onOpenChange={setConfirmOpen} open={confirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Permanently delete {checked.size} doc{checked.size === 1 ? '' : 's'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes the blob and all chunks now, before the 30-day auto-purge. The documents cannot be restored
              after this.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={running !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={running !== null}
              onClick={e => {
                e.preventDefault()
                // oxlint-disable-next-line promise/prefer-await-to-then, promise/prefer-await-to-callbacks -- React handler
                runPurge().catch((error: unknown) => toast.error(String(error)))
              }}>
              {running === 'purge' ? 'Deleting…' : 'Delete permanently'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
export default DeletedDocsPage
