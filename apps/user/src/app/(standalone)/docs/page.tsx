'use client'
import type { Id } from 'backend/convex/_generated/dataModel'
import { DocUpload, useDocSheet } from '@a/react/components'
import { cn } from '@a/ui'
import { Button } from '@a/ui/components/button'
import { api } from 'backend/convex/_generated/api'
import { useMutation, useQuery } from 'convex/react'
import { AlertCircle, RotateCw, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'

interface DocRow {
  _id: Id<'docs'>
  filename: string
  policyCategory?: string
  policyReason?: string
  policyReviewRequestedAt?: number
  policyStatus: 'approved' | 'pending' | 'rejected'
  version: number
}
const DocList = ({ docs, onOpen }: { docs?: DocRow[]; onOpen: (id: Id<'docs'>) => void }): React.ReactElement => (
  <ul className='space-y-1 text-sm'>
    {docs?.map(d => (
      <li className='flex items-center gap-1' key={d._id}>
        <button
          className={cn('min-w-0 flex-1 truncate rounded px-2 py-1 text-left font-mono hover:bg-muted')}
          onClick={() => onOpen(d._id)}
          type='button'>
          {d.filename} <span className='text-muted-foreground'>v{d.version}</span>
        </button>
        {d.policyStatus === 'pending' ? (
          <span className='flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-muted-foreground text-xs'>
            <RotateCw className='size-3' />
            Checking
          </span>
        ) : null}
      </li>
    ))}
  </ul>
)
const RejectedList = ({
  docs,
  onAskReview,
  onOpen
}: {
  docs?: DocRow[]
  onAskReview: (id: Id<'docs'>) => Promise<void>
  onOpen: (id: Id<'docs'>) => void
}): null | React.ReactElement => {
  if (!docs || docs.length === 0) return null
  return (
    <section className='space-y-2 rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3'>
      <h2 className='flex items-center gap-2 font-semibold text-sm text-yellow-700 dark:text-yellow-400'>
        <ShieldAlert className='size-4' />
        Not added to corpus
      </h2>
      <p className='text-muted-foreground text-xs'>
        These did not pass the policy check. The files are kept privately for 30 days then deleted.
      </p>
      <ul className='space-y-2'>
        {docs.map(d => {
          const reviewed = d.policyReviewRequestedAt !== undefined
          return (
            <li className='space-y-1 rounded border bg-background p-2 text-xs' key={d._id}>
              <div className='flex items-center gap-2'>
                <button
                  className='min-w-0 flex-1 truncate text-left font-mono'
                  onClick={() => onOpen(d._id)}
                  type='button'>
                  {d.filename} <span className='text-muted-foreground'>v{d.version}</span>
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
                <p className='text-muted-foreground italic'>
                  <AlertCircle aria-hidden className='mr-1 inline size-3' />
                  {d.policyCategory ? `[${d.policyCategory}] ` : ''}
                  {d.policyReason}
                </p>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
const DocsPage = (): React.ReactElement => {
  const mine = useQuery(api.docs.listMine, {})
  const shared = useQuery(api.docs.listShared, {})
  const requestReview = useMutation(api.docs.requestReview)
  const { openDoc } = useDocSheet()
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
  const mineActive = mine?.filter(d => d.policyStatus !== 'rejected')
  const mineRejected = mine?.filter(d => d.policyStatus === 'rejected')
  return (
    <div className='mx-auto flex h-dvh w-full max-w-3xl flex-col gap-4 overflow-y-auto p-6'>
      <section className='space-y-2'>
        <h2 className='font-semibold text-lg'>My docs</h2>
        <DocUpload scope='mine' />
        <DocList docs={mineActive} onOpen={onOpen} />
      </section>
      <RejectedList docs={mineRejected} onAskReview={onAskReview} onOpen={onOpen} />
      <section className='space-y-2'>
        <h2 className='font-semibold text-lg'>Shared corpus (read-only)</h2>
        <DocList docs={shared} onOpen={onOpen} />
      </section>
    </div>
  )
}
export default DocsPage
