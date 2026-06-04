/* eslint-disable no-await-in-loop */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential uploads */
/** biome-ignore-all lint/nursery/noUnnecessaryConditions: intentional while-true drain loop */
'use client'
import { cn } from '@a/ui'
import { Button } from '@a/ui/components/button'
import { Progress } from '@a/ui/components/progress'
import { api } from 'backend/convex/_generated/api'
import { useAction, useMutation } from 'convex/react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { ScanOverrideModal } from './scan-override-modal'

interface ConflictState {
  existingId: string
  filename: string
  itemId: string
  mime: string
  scope: Scope
}
interface DocUploadProps {
  isAdmin?: boolean
  scope: Scope
}
type ItemStatus = 'done' | 'error' | 'pending' | 'quarantined' | 'uploading' | 'waiting-conflict'
interface QueueItem {
  file: File
  id: string
  message?: string
  progress: number
  status: ItemStatus
}
interface ScanState {
  docId: string
  filename: string
  signature: string
}
type Scope = 'mine' | 'shared'
const STATUS_LABEL: Record<ItemStatus, string> = {
  done: 'Uploaded',
  error: 'Error',
  pending: 'Queued',
  quarantined: 'Quarantined',
  uploading: 'Uploading',
  'waiting-conflict': 'Waiting'
}
interface UploadArgs {
  file: File
  mime: string
  onProgress: (pct: number) => void
  url: string
}
const uploadWithProgress = async ({ file, mime, onProgress, url }: UploadArgs): Promise<string> =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.setRequestHeader('Content-Type', mime)
    xhr.upload.addEventListener('progress', e => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    })
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300)
        try {
          const j = JSON.parse(xhr.responseText) as { storageId: string }
          resolve(j.storageId)
        } catch (error) {
          reject(new Error(String(error)))
        }
      else reject(new Error(`upload ${xhr.status}`))
    })
    xhr.addEventListener('error', () => reject(new Error('network')))
    xhr.send(file)
  })
const DocUpload = ({ isAdmin, scope }: DocUploadProps): React.ReactElement => {
  const genUrl = useMutation(api.docs.generateUploadUrl)
  const finalize = useAction(api.docs.upload)
  const [items, setItems] = useState<QueueItem[]>([])
  const [conflict, setConflict] = useState<ConflictState | null>(null)
  const [scanQ, setScanQ] = useState<null | ScanState>(null)
  const itemsRef = useRef<QueueItem[]>([])
  const conflictRef = useRef<ConflictState | null>(null)
  const runningRef = useRef(false)
  // eslint-disable-next-line react-hooks/refs
  itemsRef.current = items
  // eslint-disable-next-line react-hooks/refs
  conflictRef.current = conflict
  const patch = (id: string, p: Partial<QueueItem>): void => {
    setItems(prev => prev.map(it => (it.id === id ? { ...it, ...p } : it)))
    itemsRef.current = itemsRef.current.map(it => (it.id === id ? { ...it, ...p } : it))
  }
  const submit = async (itemId: string, file: File, mode: { keepBoth?: boolean; replace?: boolean }): Promise<void> => {
    const filename = file.name
    const mime = file.type || 'application/octet-stream'
    patch(itemId, { progress: 0, status: 'uploading' })
    const url = await genUrl({})
    const storageId = await uploadWithProgress({ file, mime, onProgress: pct => patch(itemId, { progress: pct }), url })
    const r = await finalize({
      filename,
      keepBoth: mode.keepBoth,
      mime,
      replace: mode.replace,
      scope,
      storageId: storageId as never
    })
    if (r.ok) {
      patch(itemId, { progress: 100, status: 'done' })
      toast.success(`uploaded ${filename}`)
      return
    }
    if (r.reason === 'duplicate' && r.duplicate) {
      patch(itemId, { message: `duplicate of ${r.duplicate.filename}`, status: 'done' })
      toast.info(`already in library as ${r.duplicate.filename}`)
      return
    }
    if (r.reason === 'filename-conflict' && r.filenameConflict) {
      patch(itemId, { message: 'awaiting Replace / Keep both / Cancel', status: 'waiting-conflict' })
      const state: ConflictState = {
        existingId: r.filenameConflict.existingId,
        filename: r.filenameConflict.filename,
        itemId,
        mime,
        scope
      }
      setConflict(state)
      conflictRef.current = state
      return
    }
    if (r.reason === 'quarantined') {
      patch(itemId, { message: r.signature ?? 'suspicious', status: 'quarantined' })
      if (isAdmin && r.docId) setScanQ({ docId: r.docId, filename, signature: r.signature ?? 'unknown' })
      else toast.error(`Rejected: ${filename}. Reason: ${r.signature ?? 'unknown'}.`)
      return
    }
    patch(itemId, { message: r.reason ?? 'unknown', status: 'error' })
    toast.error(`upload failed: ${r.reason ?? 'unknown'}`)
  }
  const drain = async (): Promise<void> => {
    if (runningRef.current) return
    runningRef.current = true
    try {
      while (true) {
        if (conflictRef.current) break
        const next = itemsRef.current.find(it => it.status === 'pending')
        if (!next) break
        try {
          await submit(next.id, next.file, {})
        } catch (error: unknown) {
          patch(next.id, { message: String(error), status: 'error' })
        }
      }
    } finally {
      runningRef.current = false
    }
  }
  const onPick = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const files = [...(e.target.files ?? [])]
    if (files.length === 0) return
    const fresh: QueueItem[] = files.map((file, i) => ({
      file,
      id: `${Date.now()}-${i}-${file.name}`,
      progress: 0,
      status: 'pending'
    }))
    setItems(prev => [...prev, ...fresh])
    itemsRef.current = [...itemsRef.current, ...fresh]
    e.target.value = ''
    drain().catch((error: unknown) => toast.error(String(error)))
  }
  const resolveConflict = (mode: { keepBoth?: boolean; replace?: boolean }): void => {
    const c = conflictRef.current
    if (!c) return
    setConflict(null)
    conflictRef.current = null
    const item = itemsRef.current.find(it => it.id === c.itemId)
    if (!item) return
    submit(c.itemId, item.file, mode)
      .catch((error: unknown) => {
        patch(c.itemId, { message: String(error), status: 'error' })
      })
      .finally(() => {
        drain().catch((error: unknown) => toast.error(String(error)))
      })
  }
  const cancelConflict = (): void => {
    const c = conflictRef.current
    if (!c) return
    patch(c.itemId, { message: 'cancelled', status: 'error' })
    setConflict(null)
    conflictRef.current = null
    drain().catch((error: unknown) => toast.error(String(error)))
  }
  const clearFinished = (): void => {
    setItems(prev => prev.filter(it => it.status === 'pending' || it.status === 'uploading'))
  }
  const anyTerminal = items.some(
    it => it.status === 'done' || it.status === 'error' || it.status === 'quarantined' || it.status === 'waiting-conflict'
  )
  return (
    <div className='flex flex-col gap-3'>
      <label className='inline-flex w-fit cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted'>
        <input aria-label={`Upload files to ${scope}`} className='hidden' multiple onChange={onPick} type='file' />
        Upload to {scope}
      </label>
      {items.length > 0 ? (
        <ul className='space-y-2'>
          {items.map(it => (
            <li className='space-y-1 rounded-md border p-2 text-sm' key={it.id}>
              <div className='flex items-center gap-2'>
                <span className='flex-1 truncate font-mono text-xs'>{it.file.name}</span>
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 text-xs',
                    it.status === 'done' && 'bg-green-100 text-green-800',
                    it.status === 'error' && 'bg-destructive/10 text-destructive',
                    it.status === 'quarantined' && 'bg-yellow-100 text-yellow-800',
                    (it.status === 'pending' || it.status === 'uploading' || it.status === 'waiting-conflict') &&
                      'bg-muted text-muted-foreground'
                  )}>
                  {STATUS_LABEL[it.status]}
                </span>
              </div>
              {it.status === 'uploading' ? <Progress value={it.progress} /> : null}
              {it.message ? <div className='text-muted-foreground text-xs'>{it.message}</div> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {anyTerminal ? (
        <Button onClick={clearFinished} size='sm' variant='ghost'>
          Clear finished
        </Button>
      ) : null}
      {scanQ ? (
        <ScanOverrideModal
          docId={scanQ.docId}
          filename={scanQ.filename}
          onClose={() => setScanQ(null)}
          signature={scanQ.signature}
        />
      ) : null}
      {conflict ? (
        <div className='space-y-2 rounded-md border bg-muted p-3 text-sm'>
          <div>
            A different file with name <span className='font-mono'>{conflict.filename}</span> exists. Replace it?
          </div>
          <div className='flex gap-2'>
            <Button onClick={() => resolveConflict({ replace: true })} size='sm'>
              Replace
            </Button>
            <Button onClick={() => resolveConflict({ keepBoth: true })} size='sm' variant='secondary'>
              Keep both
            </Button>
            <Button onClick={cancelConflict} size='sm' variant='ghost'>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
export { DocUpload }
