'use client'
import type { Id } from 'backend/convex/_generated/dataModel'
import { DocUpload, useDocSheet } from '@a/react/components'
import { Button } from '@a/ui/components/button'
import { Input } from '@a/ui/components/input'
import { api } from 'backend/convex/_generated/api'
import { useMutation, useQuery } from 'convex/react'
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  Loader2,
  Presentation,
  Search,
  ShieldAlert
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

interface DocRow {
  _id: Id<'docs'>
  filename: string
  fileSize: number
  mime: string
  policyCategory?: string
  policyReason?: string
  policyReviewRequestedAt?: number
  policyStatus: 'approved' | 'pending' | 'rejected'
  uploadedAt: number
  uploadedBy: string
  version: number
}
const pad2 = (n: number): string => String(n).padStart(2, '0')
const relTime = (ms: number, now: number): string => {
  const d = now - ms
  if (d < 60_000) return 'just now'
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`
  if (d < 7 * 86_400_000) return `${Math.floor(d / 86_400_000)}d ago`
  const v = new Date(ms + 7 * 3_600_000)
  return `${v.getUTCFullYear()}-${pad2(v.getUTCMonth() + 1)}-${pad2(v.getUTCDate())}`
}
const humanSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
const iconFor = (mime: string): React.ReactNode => {
  const cls = 'size-5 shrink-0 text-muted-foreground'
  if (mime === 'application/pdf') return <FileText aria-hidden className={cls} />
  if (mime.startsWith('image/')) return <FileImage aria-hidden className={cls} />
  if (mime.includes('spreadsheet')) return <FileSpreadsheet aria-hidden className={cls} />
  if (mime.includes('presentation')) return <Presentation aria-hidden className={cls} />
  if (mime === 'text/markdown' || mime === 'text/plain') return <FileText aria-hidden className={cls} />
  return <File aria-hidden className={cls} />
}
const DocCard = ({
  doc,
  now,
  onOpen,
  showUploader
}: {
  doc: DocRow
  now: number
  onOpen: (id: Id<'docs'>) => void
  showUploader: boolean
}): React.ReactElement => (
  <li>
    <button
      className='flex w-full items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted'
      onClick={() => onOpen(doc._id)}
      type='button'>
      {iconFor(doc.mime)}
      <div className='min-w-0 flex-1'>
        <p className='truncate text-sm'>
          {doc.filename}
          {doc.version > 1 ? <span className='ml-1 text-muted-foreground text-xs'>v{doc.version}</span> : null}
        </p>
        <p className='truncate text-muted-foreground text-xs'>
          {relTime(doc.uploadedAt, now)} · {humanSize(doc.fileSize)}
          {showUploader ? ` · by ${doc.uploadedBy}` : ''}
        </p>
      </div>
      {doc.policyStatus === 'pending' ? (
        <span className='flex items-center gap-1 text-muted-foreground text-xs'>
          <Loader2 aria-hidden className='size-3 animate-spin' />
          Checking
        </span>
      ) : null}
    </button>
  </li>
)
const SectionHeader = ({ count, label }: { count: number; label: string }): React.ReactElement => (
  <div className='flex items-baseline gap-2'>
    <h2 className='font-semibold text-base'>{label}</h2>
    {count > 0 ? <span className='text-muted-foreground text-sm'>{count}</span> : null}
  </div>
)
const RejectedSection = ({
  docs,
  onAskReview,
  onOpen
}: {
  docs: DocRow[]
  onAskReview: (id: Id<'docs'>) => Promise<void>
  onOpen: (id: Id<'docs'>) => void
}): React.ReactElement => {
  const [open, setOpen] = useState(false)
  return (
    <section className='rounded-lg border border-yellow-500/30 bg-yellow-500/5'>
      <button
        className='flex w-full items-center gap-2 rounded-t-lg px-3 py-2 text-left text-sm hover:bg-yellow-500/10'
        onClick={() => setOpen(o => !o)}
        type='button'>
        {open ? <ChevronDown className='size-4' /> : <ChevronRight className='size-4' />}
        <ShieldAlert className='size-4 text-yellow-700 dark:text-yellow-400' />
        <span className='font-medium text-yellow-700 dark:text-yellow-400'>Not added ({docs.length})</span>
      </button>
      {open ? (
        <div className='space-y-2 px-3 pb-3'>
          <p className='text-muted-foreground text-xs'>
            These did not pass the policy check. Files are kept privately for 30 days then deleted.
          </p>
          <ul className='space-y-2'>
            {docs.map(d => {
              const reviewed = d.policyReviewRequestedAt !== undefined
              return (
                <li className='rounded border bg-background p-2 text-xs' key={d._id}>
                  <div className='flex items-center gap-2'>
                    <button className='min-w-0 flex-1 truncate text-left' onClick={() => onOpen(d._id)} type='button'>
                      {d.filename}
                    </button>
                    <Button
                      disabled={reviewed}
                      onClick={() => {
                        // oxlint-disable-next-line promise/prefer-await-to-then, promise/prefer-await-to-callbacks -- React handler
                        onAskReview(d._id).catch((error: unknown) => toast.error(String(error)))
                      }}
                      size='sm'
                      variant='outline'>
                      {reviewed ? 'Review requested' : 'Ask admin to reconsider'}
                    </Button>
                  </div>
                  {d.policyReason ? (
                    <p className='mt-1 text-muted-foreground italic'>
                      <AlertCircle aria-hidden className='mr-1 inline size-3' />
                      {d.policyReason}
                    </p>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
const DocsPage = (): React.ReactElement => {
  const mine = useQuery(api.docs.listMine, {})
  const shared = useQuery(api.docs.listShared, {})
  const requestReview = useMutation(api.docs.requestReview)
  const { openDoc } = useDocSheet()
  const [query, setQuery] = useState('')
  // eslint-disable-next-line react/hook-use-state -- one-shot render-time snapshot
  const [now] = useState(() => Date.now())
  const onOpen = (id: Id<'docs'>): void => {
    openDoc(id)
  }
  const onAskReview = async (id: Id<'docs'>): Promise<void> => {
    try {
      await requestReview({ docId: id })
      toast.success('Sent to admin for review')
    } catch (error: unknown) {
      toast.error(String(error))
    }
  }
  const q = query.trim().toLowerCase()
  const mineActive = useMemo(
    () => mine?.filter(d => d.policyStatus !== 'rejected' && (q === '' || d.filename.toLowerCase().includes(q))) ?? [],
    [mine, q]
  )
  const mineRejected = useMemo(() => mine?.filter(d => d.policyStatus === 'rejected') ?? [], [mine])
  const sharedFiltered = useMemo(
    () => shared?.filter(d => q === '' || d.filename.toLowerCase().includes(q)) ?? [],
    [shared, q]
  )
  return (
    <div className='mx-auto flex h-dvh w-full max-w-3xl flex-col gap-6 overflow-y-auto p-6'>
      <div className='relative'>
        <Search aria-hidden className='absolute top-2.5 left-3 size-4 text-muted-foreground' />
        <Input
          aria-label='Search documents'
          className='pl-9'
          onChange={e => setQuery(e.target.value)}
          placeholder='Search documents by name…'
          value={query}
        />
      </div>
      <section className='space-y-3'>
        <SectionHeader count={sharedFiltered.length} label='Available to everyone' />
        {shared === undefined ? (
          <p className='text-muted-foreground text-sm'>Loading…</p>
        ) : sharedFiltered.length === 0 ? (
          <p className='rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm'>
            {q ? 'No documents match your search.' : 'No shared documents yet.'}
          </p>
        ) : (
          <ul className='space-y-2'>
            {sharedFiltered.map(d => (
              <DocCard doc={d} key={d._id} now={now} onOpen={onOpen} showUploader />
            ))}
          </ul>
        )}
      </section>
      <section className='space-y-3'>
        <SectionHeader count={mineActive.length} label='My uploads' />
        <DocUpload scope='mine' />
        {mine === undefined ? (
          <p className='text-muted-foreground text-sm'>Loading…</p>
        ) : mineActive.length === 0 ? (
          <p className='rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm'>
            {q ? 'No documents match your search.' : 'Upload a file to keep it private to you.'}
          </p>
        ) : (
          <ul className='space-y-2'>
            {mineActive.map(d => (
              <DocCard doc={d} key={d._id} now={now} onOpen={onOpen} showUploader={false} />
            ))}
          </ul>
        )}
      </section>
      {mineRejected.length > 0 ? <RejectedSection docs={mineRejected} onAskReview={onAskReview} onOpen={onOpen} /> : null}
    </div>
  )
}
export default DocsPage
