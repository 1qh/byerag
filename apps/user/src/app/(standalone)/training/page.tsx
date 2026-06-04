'use client'
import { cn } from '@a/ui'
import { Badge } from '@a/ui/components/badge'
import { Button } from '@a/ui/components/button'
import { api } from 'backend/convex/_generated/api'
import { useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import { toast } from 'sonner'

const POOL_MIN = 5
const pad2 = (n: number): string => String(n).padStart(2, '0')
const fmtVN = (ms: number): string => {
  const v = new Date(ms + 7 * 3_600_000)
  return `${v.getUTCFullYear()}-${pad2(v.getUTCMonth() + 1)}-${pad2(v.getUTCDate())} ${pad2(v.getUTCHours())}:${pad2(v.getUTCMinutes())} VN`
}
interface AssignMeta {
  assignedAtMs: number
  deadlineMs: number
}
const StartButton = ({
  id,
  onStart,
  starting
}: {
  id: string
  onStart: (id: string) => Promise<void>
  starting: null | string
}): React.ReactElement => (
  <Button
    disabled={starting !== null}
    onClick={() => {
      // oxlint-disable-next-line promise/prefer-await-to-then, promise/prefer-await-to-callbacks -- React handler
      onStart(id).catch((error: unknown) => toast.error(String(error)))
    }}
    size='sm'>
    {starting === id ? 'Starting…' : 'Start (5 questions)'}
  </Button>
)
const AssignedMeta = ({
  meta,
  name,
  nowMs,
  poolSize
}: {
  meta?: AssignMeta
  name: string
  nowMs: number
  poolSize: number
}): React.ReactElement => {
  const overdue = meta ? meta.deadlineMs < nowMs : false
  return (
    <div>
      <p className='font-medium'>{name}</p>
      <p className='text-muted-foreground text-xs'>Required · 5 random questions from {poolSize}</p>
      {meta ? (
        <p className='mt-1 text-xs'>
          <span className='text-muted-foreground'>Assigned {fmtVN(meta.assignedAtMs)}</span>
          {' · '}
          <span className={cn('text-muted-foreground', overdue && 'font-medium text-yellow-700 dark:text-yellow-400')}>
            Deadline {fmtVN(meta.deadlineMs)}
            {overdue ? ' (overdue)' : ''}
          </span>
        </p>
      ) : null}
    </div>
  )
}
const TrainingPage = (): React.ReactElement => {
  const topics = useQuery(api.training.listMyTopics)
  const assignments = useQuery(api.trainingAssignments.myActiveAssignments)
  const startAttempt = useMutation(api.trainingAttempts.startAttempt)
  const [starting, setStarting] = useState<null | string>(null)
  // eslint-disable-next-line react/hook-use-state
  const [nowMs] = useState(() => Date.now())
  const onStart = async (topicId: string): Promise<void> => {
    setStarting(topicId)
    try {
      const r = await startAttempt({ topicId: topicId as never })
      globalThis.location.assign(`/training/${r.attemptId}`)
    } catch (error: unknown) {
      const msg = String(error)
      if (msg.includes('not authenticated')) {
        toast.error('Your session expired. Please sign in again.')
        globalThis.location.assign('/')
      } else toast.error(`Could not start the test: ${msg.slice(0, 120)}`)
      setStarting(null)
    }
  }
  if (topics === undefined || assignments === undefined) return <p className='p-6'>Loading…</p>
  const assignedIds = new Set(assignments.map(a => a.topicId))
  const assignMeta = new Map(assignments.map(a => [a.topicId, a]))
  const startable = topics.filter(t => t.poolSize >= POOL_MIN)
  const assigned = startable.filter(t => assignedIds.has(t._id) && t.myStatus !== 'passed-assigned')
  const practice = startable.filter(t => !(assignedIds.has(t._id) || t.myStatus.startsWith('passed-')))
  const completed = startable.filter(t => t.myStatus.startsWith('passed-'))
  return (
    <div className='mx-auto max-w-2xl space-y-8 p-6'>
      <section className='space-y-3'>
        <h1 className='font-semibold text-xl'>
          {assigned.length > 0
            ? `You have ${assigned.length} test${assigned.length === 1 ? '' : 's'} to complete`
            : 'No tests assigned to you'}
        </h1>
        {assigned.length === 0 ? (
          <p className='text-muted-foreground text-sm'>
            When an admin assigns a test it appears here.
            {practice.length > 0 ? ' You can also practice any topic below.' : ''}
          </p>
        ) : (
          <ul className='space-y-2'>
            {assigned.map(t => (
              <li className='flex items-center justify-between gap-4 rounded-lg border bg-card p-4' key={t._id}>
                <AssignedMeta meta={assignMeta.get(t._id)} name={t.name} nowMs={nowMs} poolSize={t.poolSize} />
                <StartButton id={t._id} onStart={onStart} starting={starting} />
              </li>
            ))}
          </ul>
        )}
      </section>
      {practice.length > 0 ? (
        <section className='space-y-2'>
          <h2 className='font-medium text-muted-foreground text-sm'>Practice other topics (optional)</h2>
          <ul className='divide-y rounded-lg border'>
            {practice.map(t => (
              <li className='flex items-center justify-between gap-4 p-3' key={t._id}>
                <span className='text-sm'>{t.name}</span>
                <StartButton id={t._id} onStart={onStart} starting={starting} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {completed.length > 0 ? (
        <section className='space-y-2'>
          <h2 className='font-medium text-muted-foreground text-sm'>Completed</h2>
          <ul className='flex flex-wrap gap-2'>
            {completed.map(t => (
              <li key={t._id}>
                <Badge variant='secondary'>✓ {t.name}</Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
export default TrainingPage
