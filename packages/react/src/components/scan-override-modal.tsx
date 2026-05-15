'use client'
import { api } from 'backend/convex/_generated/api'
import { useMutation } from 'convex/react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
interface ScanOverrideModalProps {
  docId: string
  filename: string
  onClose: () => void
  signature: string
}
const ScanOverrideModal = ({ docId, filename, onClose, signature }: ScanOverrideModalProps): React.ReactElement => {
  const override = useMutation(api.docs.adminScanOverride)
  const cancel = useMutation(api.docs.adminScanCancel)
  const [busy, setBusy] = useState(false)
  const noBtnRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    noBtnRef.current?.focus()
  }, [])
  const onYes = (): void => {
    setBusy(true)
    override({ docId: docId as never })
      .then(() => {
        toast.success(`override accepted for ${filename}`)
        onClose()
      })
      .catch((error: unknown) => {
        toast.error(String(error))
      })
      .finally(() => {
        setBusy(false)
      })
  }
  const onNo = (): void => {
    setBusy(true)
    cancel({ docId: docId as never })
      .then(() => {
        toast.info(`discarded ${filename}`)
        onClose()
      })
      .catch((error: unknown) => {
        toast.error(String(error))
      })
      .finally(() => {
        setBusy(false)
      })
  }
  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40'>
      <div className='w-96 space-y-3 rounded-md border bg-background p-4 shadow-lg'>
        <div className='font-semibold'>⚠ Suspicious file detected.</div>
        <div className='text-sm'>
          Filename: <span className='font-mono'>{filename}</span>
        </div>
        <div className='text-sm'>
          Reason: <span className='font-mono'>{signature}</span>
        </div>
        <div className='font-medium'>Force upload?</div>
        <div className='flex justify-end gap-2'>
          <button
            className='rounded border px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-foreground'
            disabled={busy}
            onClick={onNo}
            ref={noBtnRef}
            type='button'>
            No
          </button>
          <button
            className='rounded border bg-destructive px-3 py-1 text-destructive-foreground text-sm'
            disabled={busy}
            onClick={onYes}
            type='button'>
            Yes
          </button>
        </div>
      </div>
    </div>
  )
}
export { ScanOverrideModal }
