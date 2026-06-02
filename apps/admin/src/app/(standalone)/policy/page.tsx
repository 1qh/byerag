'use client'
import type { Id } from 'backend/convex/_generated/dataModel'
import { DocViewer } from '@a/react/components'
import { cn } from '@a/ui'
import { Button } from '@a/ui/components/button'
import { Textarea } from '@a/ui/components/textarea'
import { api } from 'backend/convex/_generated/api'
import { useMutation, useQuery } from 'convex/react'
import { AlertTriangle, CheckCircle2, FileText, MessageCircle, RotateCw, Sparkles, XCircle } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'

const clampW = (n: number): number => Math.min(720, Math.max(360, n))
const pad2 = (n: number): string => String(n).padStart(2, '0')
const fmtVN = (ms: number): string => {
  const v = new Date(ms + 7 * 3_600_000)
  return `${v.getUTCFullYear()}-${pad2(v.getUTCMonth() + 1)}-${pad2(v.getUTCDate())} ${pad2(v.getUTCHours())}:${pad2(v.getUTCMinutes())} VN`
}
const CATEGORY_LABEL: Record<string, string> = {
  abusive: 'it looks abusive or inappropriate',
  'off-topic': "it doesn't fit the corpus",
  'on-topic': 'it fits the corpus',
  promotional: 'it looks like marketing or promotion',
  'prompt-injection': 'it looks like a manipulation attempt',
  spam: 'it looks like spam'
}
const plainReason = (category?: string, reason?: string): string => {
  if (reason?.startsWith('admin-rejected'))
    return reason.replace(/^admin-rejected:?\s*/u, '') || 'You rejected it earlier.'
  if (reason?.startsWith('classifier-error:')) return 'The auto-check ran into an error and could not decide.'
  const cat = category ? CATEGORY_LABEL[category] : null
  if (cat && reason) return `${cat} — “${reason}”`
  if (cat) return cat
  return reason ?? 'No reason given.'
}
interface Row {
  _id: Id<'docs'>
  filename: string
  kind: 'appeal' | 'errored' | 'stuck'
  policyCategory?: string
  policyReason?: string
  policyReviewRequestedAt?: number
  policyStatus: 'approved' | 'pending' | 'rejected'
  scope: 'mine' | 'shared'
  uploadedAt: number
  uploadedBy: string
  version: number
}
const KindHeadline = ({ row }: { row: Row }): React.ReactElement => {
  if (row.kind === 'appeal')
    return (
      <p className='font-medium text-sm'>
        <MessageCircle aria-hidden className='mr-1 inline size-4 text-primary' />
        <span className='font-mono'>{row.uploadedBy}</span> asked you to reconsider{' '}
        <span className='font-mono font-semibold'>{row.filename}</span>
      </p>
    )
  if (row.kind === 'errored')
    return (
      <p className='font-medium text-sm'>
        <AlertTriangle aria-hidden className='mr-1 inline size-4 text-destructive' />
        The auto-check failed on <span className='font-mono font-semibold'>{row.filename}</span>
      </p>
    )
  return (
    <p className='font-medium text-sm'>
      <RotateCw aria-hidden className='mr-1 inline size-4 text-muted-foreground' />
      <span className='font-mono font-semibold'>{row.filename}</span> is still being checked
    </p>
  )
}
const PolicyInboxPage = (): React.ReactElement => {
  const rows = useQuery(api.docs.listPolicyPending, {})
  const stats = useQuery(api.docs.policyTodayStats, {})
  const approve = useMutation(api.docs.adminApproveReview)
  const reject = useMutation(api.docs.adminConfirmReject)
  const reclassify = useMutation(api.docs.adminReclassifyDoc)
  const [selected, setSelected] = useState<Id<'docs'> | null>(null)
  const [busy, setBusy] = useState<null | string>(null)
  const [comment, setComment] = useState('')
  const [listW, setListW] = useState(540)
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
  const onApprove = async (id: Id<'docs'>): Promise<void> => {
    setBusy(id)
    try {
      await approve({ comment: comment.trim() || undefined, docId: id })
      toast.success('Added to the corpus')
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
      toast.success('Kept out of the corpus')
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
      toast.success('Asking the auto-check to try again')
    } catch (error: unknown) {
      toast.error(String(error))
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className='flex h-dvh flex-col'>
      <header className='flex items-center gap-4 border-b px-4 py-3'>
        <h1 className='font-semibold text-lg'>Policy</h1>
        <nav className='flex items-center gap-1 text-sm'>
          <span className='rounded bg-muted px-2 py-1 font-medium'>Inbox</span>
          <Link className='rounded px-2 py-1 text-muted-foreground hover:bg-muted' href='/policy/settings'>
            Rules
          </Link>
        </nav>
        {stats ? (
          <div className='ml-auto flex items-center gap-3 text-muted-foreground text-xs'>
            <span>
              <Sparkles aria-hidden className='mr-1 inline size-3' />
              Today: {stats.uploaded} uploaded · {stats.accepted} added · {stats.rejected} not added
            </span>
            {stats.errored > 0 ? <span className='text-destructive'>· {stats.errored} errored</span> : null}
          </div>
        ) : null}
      </header>
      <div className='flex flex-1 overflow-hidden'>
        <aside
          className='flex shrink-0 flex-col overflow-hidden border-r bg-muted/20'
          // oxlint-disable-next-line react-perf/jsx-no-new-object-as-prop -- width is stateful
          style={{ width: `${listW}px` }}>
          {rows === undefined ? (
            <div className='p-6 text-muted-foreground text-sm'>Loading…</div>
          ) : rows.length === 0 ? (
            <div className='flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center'>
              <CheckCircle2 aria-hidden className='size-12 text-green-600' />
              <p className='font-medium'>All clear</p>
              <p className='max-w-xs text-muted-foreground text-sm'>
                The auto-check handled every upload today. Nothing here needs you right now.
              </p>
              {stats && stats.uploaded > 0 ? (
                <p className='text-muted-foreground text-xs'>
                  Today the auto-check accepted {stats.accepted} and rejected {stats.rejected} of {stats.uploaded} uploads.
                </p>
              ) : null}
            </div>
          ) : (
            <ul className='flex-1 space-y-2 overflow-auto p-3'>
              {rows.map(r => {
                const isSel = selected === r._id
                const isBusy = busy === r._id
                return (
                  <li
                    className={cn(
                      'rounded-lg border bg-background p-3 shadow-sm transition-colors',
                      isSel && 'ring-2 ring-primary/40'
                    )}
                    key={r._id}>
                    <KindHeadline row={r} />
                    <p className='mt-1 text-muted-foreground text-xs'>
                      {r.scope === 'shared' ? 'For the shared corpus' : 'Personal upload'} ·{' '}
                      {r.kind === 'appeal' && r.policyReviewRequestedAt
                        ? `asked ${fmtVN(r.policyReviewRequestedAt)}`
                        : `uploaded ${fmtVN(r.uploadedAt)}`}
                    </p>
                    {r.policyReason || r.policyCategory ? (
                      <p className='mt-2 rounded bg-muted/50 px-2 py-1.5 text-muted-foreground text-xs italic'>
                        AI said: {plainReason(r.policyCategory, r.policyReason)}
                      </p>
                    ) : null}
                    <div className='mt-3 flex flex-wrap gap-2'>
                      <Button onClick={() => setSelected(r._id)} size='sm' variant='outline'>
                        <FileText className='size-4' />
                        Look at file
                      </Button>
                      <Button
                        disabled={isBusy}
                        onClick={() => {
                          // oxlint-disable-next-line promise/prefer-await-to-then, promise/prefer-await-to-callbacks -- React handler
                          onApprove(r._id).catch((error: unknown) => toast.error(String(error)))
                        }}
                        size='sm'>
                        <CheckCircle2 className='size-4' />
                        Add to corpus
                      </Button>
                      {r.kind === 'appeal' ? (
                        <Button
                          disabled={isBusy}
                          onClick={() => {
                            // oxlint-disable-next-line promise/prefer-await-to-then, promise/prefer-await-to-callbacks -- React handler
                            onReject(r._id).catch((error: unknown) => toast.error(String(error)))
                          }}
                          size='sm'
                          variant='outline'>
                          <XCircle className='size-4' />I agree with AI
                        </Button>
                      ) : (
                        <Button
                          disabled={isBusy}
                          onClick={() => {
                            // oxlint-disable-next-line promise/prefer-await-to-then, promise/prefer-await-to-callbacks -- React handler
                            onReject(r._id).catch((error: unknown) => toast.error(String(error)))
                          }}
                          size='sm'
                          variant='outline'>
                          <XCircle className='size-4' />
                          Don&apos;t add
                        </Button>
                      )}
                      {r.kind === 'appeal' ? null : (
                        <Button
                          disabled={isBusy}
                          onClick={() => {
                            // oxlint-disable-next-line promise/prefer-await-to-then, promise/prefer-await-to-callbacks -- React handler
                            onReclassify(r._id).catch((error: unknown) => toast.error(String(error)))
                          }}
                          size='sm'
                          variant='outline'>
                          <RotateCw className='size-4' />
                          Try AI again
                        </Button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          <div className='border-t bg-background p-3'>
            <Textarea
              aria-label='Decision comment'
              className='h-14'
              onChange={e => setComment(e.target.value)}
              placeholder="Optional comment for the audit log (applied when you Add or Don't add)…"
              value={comment}
            />
          </div>
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
            <div className='flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground'>
              <FileText aria-hidden className='size-10 opacity-40' />
              <p className='font-medium'>Pick &ldquo;Look at file&rdquo; on any item</p>
              <p className='max-w-sm text-sm'>
                The auto-check handles most uploads. You only see the ones it could not decide or that an employee
                appealed.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
export default PolicyInboxPage
