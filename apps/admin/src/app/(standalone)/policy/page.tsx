'use client'
import type { Id } from 'backend/convex/_generated/dataModel'
import { DocViewer } from '@a/react/components'
import { cn } from '@a/ui'
import { Button } from '@a/ui/components/button'
import { Textarea } from '@a/ui/components/textarea'
import { api } from 'backend/convex/_generated/api'
import { useMutation, useQuery } from 'convex/react'
import { AlertCircle, CheckCircle2, FileText, RotateCw, ShieldAlert, XCircle } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'

const clampW = (n: number): number => Math.min(640, Math.max(280, n))
const pad2 = (n: number): string => String(n).padStart(2, '0')
const fmtVN = (ms: number): string => {
  const v = new Date(ms + 7 * 3_600_000)
  return `${v.getUTCFullYear()}-${pad2(v.getUTCMonth() + 1)}-${pad2(v.getUTCDate())} ${pad2(v.getUTCHours())}:${pad2(v.getUTCMinutes())} VN`
}
interface Row {
  _id: Id<'docs'>
  filename: string
  isLimbo: boolean
  policyCategory?: string
  policyReason?: string
  policyReviewRequestedAt?: number
  policyStatus: 'approved' | 'pending' | 'rejected'
  scope: 'mine' | 'shared'
  uploadedAt: number
  uploadedBy: string
  version: number
}
const StatusBadge = ({ row }: { row: Row }): React.ReactElement => {
  if (row.isLimbo)
    return (
      <span className='flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-0.5 text-destructive text-xs'>
        <AlertCircle className='size-3' />
        Classifier error
      </span>
    )
  if (row.policyStatus === 'pending')
    return (
      <span className='flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-muted-foreground text-xs'>
        <RotateCw className='size-3' />
        Pending
      </span>
    )
  return (
    <span className='flex items-center gap-1 rounded bg-yellow-500/10 px-1.5 py-0.5 text-xs text-yellow-700 dark:text-yellow-400'>
      <ShieldAlert className='size-3' />
      Rejected
    </span>
  )
}
const PolicyQueuePage = (): React.ReactElement => {
  const rows = useQuery(api.docs.listPolicyPending, {})
  const approve = useMutation(api.docs.adminApproveReview)
  const reject = useMutation(api.docs.adminConfirmReject)
  const reclassify = useMutation(api.docs.adminReclassifyDoc)
  const [selected, setSelected] = useState<Id<'docs'> | null>(null)
  const [busy, setBusy] = useState<null | string>(null)
  const [comment, setComment] = useState('')
  const [listW, setListW] = useState(420)
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
  const current = rows?.find(r => r._id === selected) ?? null
  const onApprove = async (id: Id<'docs'>): Promise<void> => {
    setBusy(id)
    try {
      await approve({ comment: comment.trim() || undefined, docId: id })
      toast.success('Approved — added to corpus')
      setComment('')
      if (selected === id) setSelected(null)
    } catch (error: unknown) {
      toast.error(String(error))
    } finally {
      setBusy(null)
    }
  }
  const onReject = async (id: Id<'docs'>): Promise<void> => {
    setBusy(id)
    try {
      await reject({ comment: comment.trim() || undefined, docId: id })
      toast.success('Rejection confirmed')
      setComment('')
      if (selected === id) setSelected(null)
    } catch (error: unknown) {
      toast.error(String(error))
    } finally {
      setBusy(null)
    }
  }
  const onReclassify = async (id: Id<'docs'>): Promise<void> => {
    setBusy(id)
    try {
      await reclassify({ docId: id })
      toast.success('Re-classifying — refresh shortly')
    } catch (error: unknown) {
      toast.error(String(error))
    } finally {
      setBusy(null)
    }
  }
  const pendingCount = rows?.filter(r => r.policyStatus === 'pending').length ?? 0
  const limboCount = rows?.filter(r => r.isLimbo).length ?? 0
  const rejectedCount = rows?.filter(r => r.policyStatus === 'rejected').length ?? 0
  return (
    <div className='flex h-dvh flex-col'>
      <header className='flex items-center gap-4 border-b px-4 py-3'>
        <h1 className='font-semibold text-lg'>Policy</h1>
        <nav className='flex items-center gap-1 text-sm'>
          <span className='rounded bg-muted px-2 py-1 font-medium'>Queue</span>
          <Link className='rounded px-2 py-1 text-muted-foreground hover:bg-muted' href='/policy/settings'>
            Rules
          </Link>
        </nav>
        <div className='ml-auto flex items-center gap-3 text-muted-foreground text-xs'>
          <span>{pendingCount} pending</span>
          <span>·</span>
          <span className={cn(limboCount > 0 && 'font-medium text-destructive')}>{limboCount} errored</span>
          <span>·</span>
          <span>{rejectedCount} rejected (30d)</span>
        </div>
      </header>
      <div className='flex flex-1 overflow-hidden'>
        <aside
          className='flex shrink-0 flex-col overflow-hidden border-r'
          // oxlint-disable-next-line react-perf/jsx-no-new-object-as-prop -- width is stateful
          style={{ width: `${listW}px` }}>
          {rows === undefined ? (
            <div className='p-4 text-muted-foreground text-sm'>Loading…</div>
          ) : rows.length === 0 ? (
            <div className='p-4 text-muted-foreground text-sm'>Nothing in the queue. Corpus is clean.</div>
          ) : (
            <ul className='flex-1 space-y-1 overflow-auto p-2 text-sm'>
              {rows.map(r => (
                <li key={r._id}>
                  <button
                    className={cn(
                      'flex w-full flex-col gap-1 rounded px-2 py-1.5 text-left hover:bg-muted',
                      selected === r._id && 'bg-muted'
                    )}
                    onClick={() => setSelected(r._id)}
                    type='button'>
                    <span className='flex items-center gap-2'>
                      <span className='min-w-0 flex-1 truncate font-mono'>
                        {r.filename} <span className='text-muted-foreground'>v{r.version}</span>
                      </span>
                      <StatusBadge row={r} />
                    </span>
                    <span className='text-muted-foreground text-xs'>
                      {r.scope} · {r.uploadedBy} · {fmtVN(r.uploadedAt)}
                      {r.policyReviewRequestedAt ? ' · review requested' : ''}
                    </span>
                    {r.policyReason ? (
                      <span className='line-clamp-2 text-muted-foreground/80 text-xs italic'>
                        {r.policyCategory ? `[${r.policyCategory}] ` : ''}
                        {r.policyReason}
                      </span>
                    ) : null}
                  </button>
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
        <main className='flex flex-1 flex-col overflow-hidden'>
          {current ? (
            <>
              <div className='flex flex-wrap items-center gap-2 border-b px-4 py-3'>
                <div className='min-w-0 flex-1'>
                  <div className='truncate font-mono font-semibold'>{current.filename}</div>
                  <div className='text-muted-foreground text-xs'>
                    {current.scope} · {current.uploadedBy} · uploaded {fmtVN(current.uploadedAt)}
                  </div>
                </div>
                <Button
                  disabled={busy === current._id}
                  onClick={() => {
                    // oxlint-disable-next-line promise/prefer-await-to-then, promise/prefer-await-to-callbacks -- React handler
                    onApprove(current._id).catch((error: unknown) => toast.error(String(error)))
                  }}
                  size='sm'>
                  <CheckCircle2 className='size-4' />
                  Approve
                </Button>
                <Button
                  disabled={busy === current._id}
                  onClick={() => {
                    // oxlint-disable-next-line promise/prefer-await-to-then, promise/prefer-await-to-callbacks -- React handler
                    onReject(current._id).catch((error: unknown) => toast.error(String(error)))
                  }}
                  size='sm'
                  variant='destructive'>
                  <XCircle className='size-4' />
                  Reject
                </Button>
                <Button
                  disabled={busy === current._id}
                  onClick={() => {
                    // oxlint-disable-next-line promise/prefer-await-to-then, promise/prefer-await-to-callbacks -- React handler
                    onReclassify(current._id).catch((error: unknown) => toast.error(String(error)))
                  }}
                  size='sm'
                  variant='outline'>
                  <RotateCw className='size-4' />
                  Re-classify
                </Button>
              </div>
              {current.policyReason ? (
                <div className='border-b bg-muted/30 px-4 py-2 text-sm'>
                  <span className='font-semibold'>Classifier said:</span>{' '}
                  {current.policyCategory ? (
                    <span className='text-muted-foreground'>[{current.policyCategory}] </span>
                  ) : null}
                  <span className='italic'>{current.policyReason}</span>
                </div>
              ) : null}
              <div className='border-b px-4 py-3'>
                <Textarea
                  aria-label='Decision comment'
                  className='h-16'
                  onChange={e => setComment(e.target.value)}
                  placeholder='Optional comment for the audit log…'
                  value={comment}
                />
              </div>
              <div className='flex-1 overflow-auto'>
                <DocViewer docId={current._id} />
              </div>
            </>
          ) : (
            <div className='flex h-full flex-col items-center justify-center gap-3 text-muted-foreground'>
              <FileText aria-hidden className='size-10 opacity-40' />
              <p className='font-medium'>Pick a doc to review</p>
              <p className='text-sm'>Approve or reject decides whether it enters the corpus.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
export default PolicyQueuePage
