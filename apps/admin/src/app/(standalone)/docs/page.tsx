/* eslint-disable no-await-in-loop, complexity */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential bulk delete */
'use client'
import type { Id } from 'backend/convex/_generated/dataModel'
import { DocUpload, useDocSheet } from '@a/react/components'
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
import { Input } from '@a/ui/components/input'
import { api } from 'backend/convex/_generated/api'
import { useMutation, useQuery } from 'convex/react'
import {
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  Loader2,
  Presentation,
  Search,
  Sparkles,
  Trash2
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

interface DocRow {
  _id: Id<'docs'>
  filename: string
  fileSize: number
  mime: string
  policyStatus?: 'approved' | 'pending' | 'rejected'
  summary?: string
  uploadedAt: number
  uploadedBy?: string
  version: number
}
const NAME_SPLIT_RE = /[\s@]/u
const ASK_TRAILING_QUESTION_RE = /[?？]$/u
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
const fileTypeFor = (mime: string): { Icon: typeof FileText; tone: string } => {
  if (mime === 'application/pdf') return { Icon: FileText, tone: 'bg-destructive/10 text-destructive' }
  if (mime.startsWith('image/')) return { Icon: FileImage, tone: 'bg-primary/10 text-primary' }
  if (mime.includes('spreadsheet')) return { Icon: FileSpreadsheet, tone: 'bg-secondary text-secondary-foreground' }
  if (mime.includes('presentation')) return { Icon: Presentation, tone: 'bg-secondary text-secondary-foreground' }
  if (mime === 'text/markdown' || mime === 'text/plain') return { Icon: FileText, tone: 'bg-muted text-muted-foreground' }
  return { Icon: File, tone: 'bg-muted text-muted-foreground' }
}
const FileTypeChip = ({ mime }: { mime: string }): React.ReactElement => {
  const { Icon, tone } = fileTypeFor(mime)
  return (
    <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', tone)}>
      <Icon aria-hidden className='size-5' />
    </span>
  )
}
const DocCard = ({
  doc,
  now,
  onOpen,
  onToggleSelect,
  selectMode,
  selected
}: {
  doc: DocRow
  now: number
  onOpen: (id: Id<'docs'>) => void
  onToggleSelect?: (id: Id<'docs'>) => void
  selected?: boolean
  selectMode?: boolean
}): React.ReactElement => (
  <li
    className={cn(
      'flex items-stretch gap-1 rounded-xl border bg-card transition-all hover:-translate-y-px hover:shadow-md',
      selected && 'bg-muted'
    )}>
    {selectMode ? (
      <span className='flex items-center pl-3'>
        <Checkbox
          aria-label={`Select ${doc.filename}`}
          checked={selected ?? false}
          onCheckedChange={() => onToggleSelect?.(doc._id)}
        />
      </span>
    ) : null}
    <button
      className='group flex min-w-0 flex-1 items-center gap-3 rounded-l-xl px-3 py-3 text-left'
      onClick={() => (selectMode ? onToggleSelect?.(doc._id) : onOpen(doc._id))}
      title={`${relTime(doc.uploadedAt, now)} · ${humanSize(doc.fileSize)}${doc.uploadedBy ? ` · by ${doc.uploadedBy}` : ''}`}
      type='button'>
      <FileTypeChip mime={doc.mime} />
      <div className='min-w-0 flex-1'>
        <p className='truncate font-medium text-sm'>
          {doc.filename}
          {doc.version > 1 ? <span className='ml-1 text-muted-foreground text-xs'>v{doc.version}</span> : null}
        </p>
        <p className='line-clamp-2 text-muted-foreground text-xs'>
          {doc.summary ?? `Added ${relTime(doc.uploadedAt, now)}.`}
        </p>
      </div>
      {doc.policyStatus === 'pending' ? (
        <span className='flex items-center gap-1 pr-2 text-muted-foreground text-xs'>
          <Loader2 aria-hidden className='size-3 animate-spin' />
          Reading…
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
const DocsPage = (): React.ReactElement => {
  const me = useQuery(api.chats.currentUser, {})
  const shared = useQuery(api.docs.listShared, {})
  const highlights = useQuery(api.docs.weeklyHighlights, {})
  const remove = useMutation(api.docs.adminDeleteDoc)
  const { openDoc } = useDocSheet()
  const router = useRouter()
  const [query, setQuery] = useState('')
  // eslint-disable-next-line react/hook-use-state -- one-shot render-time snapshot
  const [now] = useState(() => Date.now())
  const [expanded, setExpanded] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const onOpen = (id: Id<'docs'>): void => {
    openDoc(id)
  }
  const onToggleSelect = (id: Id<'docs'>): void =>
    setSelected(prev => {
      const next = new Set(prev)
      const key = id as string
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  const exitSelectMode = (): void => {
    setSelectMode(false)
    setSelected(new Set())
  }
  const runDelete = async (): Promise<void> => {
    setDeleting(true)
    const ids = [...selected]
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
    setConfirmOpen(false)
    setDeleting(false)
    exitSelectMode()
  }
  const q = query.trim().toLowerCase()
  const sharedFiltered = useMemo(
    () => shared?.filter(d => q === '' || d.filename.toLowerCase().includes(q)) ?? [],
    [shared, q]
  )
  const previewNames = sharedFiltered
    .filter(d => selected.has(d._id as string))
    .slice(0, 5)
    .map(d => d.filename)
    .join(', ')
  const moreCount = selected.size > 5 ? selected.size - 5 : 0
  const firstName = (me?.name ?? me?.email ?? '').split(NAME_SPLIT_RE)[0] ?? ''
  const submitHeroAsk = (): void => {
    const v = query.trim()
    if (!v) return
    if (ASK_TRAILING_QUESTION_RE.test(v)) {
      try {
        globalThis.localStorage.setItem('draft-new', v)
      } catch {
        // LocalStorage unavailable; navigation still proceeds
      }
      router.push('/')
    }
  }
  return (
    <div className='mx-auto flex h-dvh w-full max-w-3xl flex-col gap-6 overflow-y-auto p-6'>
      <header className='space-y-3'>
        <h1 className='font-semibold text-2xl tracking-tight'>
          {firstName ? `Hi ${firstName}, what is the team working on?` : 'What is the team working on?'}
        </h1>
        <div className='relative'>
          <Search aria-hidden className='absolute top-3 left-3 size-4 text-muted-foreground' />
          <Input
            aria-label='Search files or ask the assistant'
            className='h-11 rounded-xl pr-3 pl-9 text-sm shadow-sm'
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') submitHeroAsk()
            }}
            placeholder='Search files, or ask the assistant (end with ?)…'
            value={query}
          />
        </div>
      </header>
      {!q && highlights && highlights.length > 0 ? (
        <section className='rounded-xl border bg-gradient-to-br from-primary/5 to-card p-4 shadow-sm'>
          <div className='flex items-center gap-2 text-sm'>
            <Sparkles aria-hidden className='size-4 text-primary' />
            <h2 className='font-semibold'>What is worth knowing this week</h2>
          </div>
          <ul className='mt-2 space-y-1.5'>
            {highlights.map(h => (
              <li key={h._id}>
                <button
                  className='flex w-full items-start gap-2 rounded-md p-1.5 text-left text-sm hover:bg-muted'
                  onClick={() => onOpen(h._id)}
                  type='button'>
                  <span className='mt-1 size-1.5 shrink-0 rounded-full bg-primary' />
                  <span className='min-w-0 flex-1'>
                    <span className='font-medium'>{h.filename}</span>
                    {h.summary ? <span className='ml-1 text-muted-foreground'>— {h.summary}</span> : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className='space-y-3'>
        <div className='flex items-center justify-between gap-2'>
          <SectionHeader count={sharedFiltered.length} label='Shared corpus' />
          {sharedFiltered.length > 0 ? (
            selectMode ? (
              <div className='flex items-center gap-2 text-sm'>
                <span className='text-muted-foreground'>{selected.size} selected</span>
                <Button
                  disabled={selected.size === 0 || deleting}
                  onClick={() => setConfirmOpen(true)}
                  size='sm'
                  variant='destructive'>
                  <Trash2 className='size-4' />
                  Delete {selected.size > 0 ? selected.size : ''}
                </Button>
                <Button disabled={deleting} onClick={exitSelectMode} size='sm' variant='ghost'>
                  Done
                </Button>
              </div>
            ) : (
              <Button onClick={() => setSelectMode(true)} size='sm' variant='outline'>
                Select
              </Button>
            )
          ) : null}
        </div>
        <p className='text-muted-foreground text-xs'>The assistant cites these when it answers your team.</p>
        <DocUpload isAdmin scope='shared' />
        {shared === undefined ? (
          <p className='text-muted-foreground text-sm'>Loading…</p>
        ) : sharedFiltered.length === 0 ? (
          <p className='rounded-xl border border-dashed p-6 text-center text-muted-foreground text-sm'>
            {q ? 'Nothing matches your search yet.' : 'No shared documents yet. Upload to seed the corpus.'}
          </p>
        ) : (
          <>
            <ul className='space-y-2'>
              {(q || expanded ? sharedFiltered : sharedFiltered.slice(0, 5)).map(d => (
                <DocCard
                  doc={d}
                  key={d._id}
                  now={now}
                  onOpen={onOpen}
                  onToggleSelect={onToggleSelect}
                  selected={selected.has(d._id as string)}
                  selectMode={selectMode}
                />
              ))}
            </ul>
            {!q && sharedFiltered.length > 5 ? (
              <Button onClick={() => setExpanded(v => !v)} size='sm' variant='ghost'>
                {expanded ? 'Show less' : `Show all (${sharedFiltered.length})`}
              </Button>
            ) : null}
          </>
        )}
      </section>
      <AlertDialog
        onOpenChange={open => {
          if (!(open || deleting)) setConfirmOpen(false)
        }}
        open={confirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selected.size} document{selected.size === 1 ? '' : 's'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Soft-delete removes them from the corpus and cascades to pending question suggestions + approved questions:{' '}
              {previewNames}
              {moreCount > 0 ? ` and ${moreCount} more` : ''}. Blobs hard-purge after 30 days.
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
