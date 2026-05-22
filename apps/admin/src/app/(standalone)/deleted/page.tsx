'use client'
import type { Id } from 'backend/convex/_generated/dataModel'
import { DocViewer } from '@a/react/components'
import { cn } from '@a/ui'
import { Button } from '@a/ui/components/button'
import { api } from 'backend/convex/_generated/api'
import { useMutation, useQuery } from 'convex/react'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

const clampW = (n: number): number => Math.min(640, Math.max(240, n))
const pad2 = (n: number): string => String(n).padStart(2, '0')
const fmtVN = (ms: number): string => {
  const v = new Date(ms + 7 * 3_600_000)
  return `${v.getUTCFullYear()}-${pad2(v.getUTCMonth() + 1)}-${pad2(v.getUTCDate())} ${pad2(v.getUTCHours())}:${pad2(v.getUTCMinutes())} VN`
}
const DeletedDocsPage = (): React.ReactElement => {
  const rows = useQuery(api.docs.listDeleted, {})
  const restore = useMutation(api.docs.adminRestoreDoc)
  const [busy, setBusy] = useState<null | string>(null)
  const [selected, setSelected] = useState<Id<'docs'> | null>(null)
  const [listW, setListW] = useState(384)
  const startResize = (e: React.PointerEvent): void => {
    e.preventDefault()
    const startX = e.clientX
    const startW = listW
    const move = (ev: PointerEvent): void => setListW(clampW(startW + ev.clientX - startX))
    const up = (): void => {
      globalThis.removeEventListener('pointermove', move)
      globalThis.removeEventListener('pointerup', up)
    }
    globalThis.addEventListener('pointermove', move)
    globalThis.addEventListener('pointerup', up)
  }
  const onRestore = async (docId: string): Promise<void> => {
    setBusy(docId)
    try {
      await restore({ docId: docId as Id<'docs'> })
      toast.success('Document restored')
      if (selected === docId) setSelected(null)
    } catch (error: unknown) {
      toast.error(String(error))
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className='flex h-dvh'>
      <aside
        className='flex shrink-0 flex-col border-r'
        // oxlint-disable-next-line react-perf/jsx-no-new-object-as-prop -- width is stateful
        style={{ width: `${listW}px` }}>
        <div className='flex items-center gap-2 border-b p-4'>
          <Trash2 aria-hidden className='size-5 text-muted-foreground' />
          <h1 className='font-semibold text-lg'>Trash</h1>
        </div>
        <p className='border-b p-4 text-muted-foreground text-xs'>
          Excluded from agent retrieval. Blobs hard-purge 30 days after deletion; restore before then to bring a doc back
          into the corpus.
        </p>
        {rows === undefined ? (
          <div className='p-4 text-muted-foreground text-sm'>Loading…</div>
        ) : rows.length === 0 ? (
          <div className='p-4 text-muted-foreground text-sm'>No deleted documents.</div>
        ) : (
          <ul className='flex-1 space-y-1 overflow-auto p-2 text-sm'>
            {rows.map(r => (
              <li
                className={cn(
                  'flex items-center gap-2 rounded px-2 py-1 hover:bg-muted',
                  selected === r._id && 'bg-muted'
                )}
                key={r._id}>
                <button className='min-w-0 flex-1 text-left' onClick={() => setSelected(r._id)} type='button'>
                  <span className='block truncate font-mono'>
                    {r.filename} <span className='text-muted-foreground'>v{r.version}</span>
                  </span>
                  <span className='text-muted-foreground text-xs'>
                    {r.scope} · deleted {fmtVN(r.deletedAt)}
                  </span>
                </button>
                <Button
                  disabled={busy === r._id}
                  onClick={() => {
                    // oxlint-disable-next-line promise/prefer-await-to-then, promise/prefer-await-to-callbacks -- React handler
                    onRestore(r._id).catch((error: unknown) => toast.error(String(error)))
                  }}
                  size='sm'
                  variant='outline'>
                  {busy === r._id ? 'Restoring…' : 'Restore'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </aside>
      <button
        aria-label='Resize preview'
        className='w-1 shrink-0 cursor-col-resize bg-border hover:bg-primary/40'
        onPointerDown={startResize}
        type='button'
      />
      <main className='flex-1 overflow-auto'>
        {selected ? (
          <DocViewer docId={selected} />
        ) : (
          <div className='flex h-full flex-col items-center justify-center gap-3 text-muted-foreground'>
            <Trash2 aria-hidden className='size-10 opacity-40' />
            <p className='font-medium'>Select a deleted document to preview</p>
            <p className='text-sm'>Click a file on the left to view its content before restoring.</p>
          </div>
        )}
      </main>
    </div>
  )
}
export default DeletedDocsPage
