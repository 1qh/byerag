'use client'
import { api } from 'backend/convex/_generated/api'
import { useAction, useMutation } from 'convex/react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ScanOverrideModal } from './scan-override-modal'
interface ConflictState {
  existingId: string
  file: File
  filename: string
  mime: string
  scope: Scope
}
interface DocUploadProps {
  isAdmin?: boolean
  scope: Scope
}
interface ScanState {
  docId: string
  filename: string
  signature: string
}
type Scope = 'mine' | 'shared'
const DocUpload = ({ isAdmin, scope }: DocUploadProps): React.ReactElement => {
  const genUrl = useMutation(api.docs.generateUploadUrl)
  const finalize = useAction(api.docs.upload)
  const [busy, setBusy] = useState(false)
  const [conflict, setConflict] = useState<ConflictState | null>(null)
  const [scanQ, setScanQ] = useState<null | ScanState>(null)
  const submit = async (file: File, mode: { keepBoth?: boolean; replace?: boolean }): Promise<void> => {
    setBusy(true)
    try {
      const filename = file.name
      const mime = file.type || 'application/octet-stream'
      const url = await genUrl({})
      const res = await fetch(url, { body: file, headers: { 'Content-Type': mime }, method: 'POST' })
      const j = (await res.json()) as { storageId: string }
      const r = await finalize({
        filename,
        keepBoth: mode.keepBoth,
        mime,
        replace: mode.replace,
        scope,
        storageId: j.storageId as never
      })
      if (r.ok) {
        toast.success(`uploaded ${filename}`)
        setConflict(null)
        return
      }
      if (r.reason === 'duplicate' && r.duplicate) {
        toast.info(`already in library as ${r.duplicate.filename}`)
        return
      }
      if (r.reason === 'filename-conflict' && r.filenameConflict) {
        setConflict({
          existingId: r.filenameConflict.existingId,
          file,
          filename: r.filenameConflict.filename,
          mime,
          scope
        })
        return
      }
      if (r.reason === 'quarantined') {
        if (isAdmin && r.docId) setScanQ({ docId: r.docId, filename, signature: r.signature ?? 'unknown' })
        else toast.error(`Your file was rejected because it appeared suspicious. Reason: ${r.signature ?? 'unknown'}.`)
        return
      }
      toast.error(`upload failed: ${r.reason ?? 'unknown'}`)
    } catch (error: unknown) {
      toast.error(String(error))
    } finally {
      setBusy(false)
    }
  }
  const onPick = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (file) submit(file, {}).catch(() => undefined)
    e.target.value = ''
  }
  return (
    <div className='flex flex-col gap-2'>
      <label className='inline-flex cursor-pointer items-center gap-2 rounded border px-3 py-1 text-sm hover:bg-muted'>
        <input className='hidden' disabled={busy} onChange={onPick} type='file' />
        {busy ? 'Uploading…' : `Upload to ${scope}`}
      </label>
      {scanQ ? (
        <ScanOverrideModal
          docId={scanQ.docId}
          filename={scanQ.filename}
          onClose={() => {
            setScanQ(null)
          }}
          signature={scanQ.signature}
        />
      ) : null}
      {conflict ? (
        <div className='space-y-2 rounded border bg-muted p-3 text-sm'>
          <div>
            A different file with name <span className='font-mono'>{conflict.filename}</span> exists. Replace it?
          </div>
          <div className='flex gap-2'>
            <button
              className='rounded border px-2 py-1'
              onClick={() => {
                submit(conflict.file, { replace: true }).catch(() => undefined)
              }}
              type='button'>
              Replace
            </button>
            <button
              className='rounded border px-2 py-1'
              onClick={() => {
                submit(conflict.file, { keepBoth: true }).catch(() => undefined)
              }}
              type='button'>
              Keep both
            </button>
            <button
              className='rounded border px-2 py-1'
              onClick={() => {
                setConflict(null)
              }}
              type='button'>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
export { DocUpload }
