/* eslint-disable complexity */
'use client'
import { useDocSheet } from '@a/react/components'
import { cn } from '@a/ui'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@a/ui/components/table'
import { api } from 'backend/convex/_generated/api'
import type { Id } from 'backend/convex/_generated/dataModel'
import { useQuery } from 'convex/react'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useState } from 'react'
import { AttemptHistoryModal } from '../../_components/attempt-history-modal'

const fmtDate = (ms?: number): string => (ms ? new Date(ms).toISOString().slice(0, 10) : '—')
const StatCard = ({
  hint,
  label,
  tone,
  value
}: {
  hint: string
  label: string
  tone?: 'attention' | 'default' | 'warn'
  value: React.ReactNode
}): React.ReactElement => (
  <div className='rounded-lg border bg-card p-4'>
    <div className='font-semibold text-muted-foreground text-xs uppercase tracking-wide'>{label}</div>
    <div
      className={cn(
        'mt-2 font-bold text-3xl',
        tone === 'warn' && 'text-yellow-700 dark:text-yellow-400',
        tone === 'attention' && 'text-destructive'
      )}>
      {value}
    </div>
    <div className='mt-1 text-muted-foreground text-sm'>{hint}</div>
  </div>
)
const TestDetailPage = (): React.ReactElement => {
  const params = useParams<{ slug: string }>()
  const slug = params.slug
  const data = useQuery(api.dashboard.testDetail, { slug })
  const { openDoc } = useDocSheet()
  const [questionsOpen, setQuestionsOpen] = useState(false)
  const [drilldownUser, setDrilldownUser] = useState<null | string>(null)
  if (data === undefined) return <div className='p-6 text-muted-foreground'>Loading…</div>
  if (data === null)
    return (
      <div className='space-y-3 p-6'>
        <Link
          className='inline-flex items-center gap-1 text-muted-foreground text-sm hover:text-foreground'
          href='/training'>
          <ArrowLeft aria-hidden className='size-3' />
          Training
        </Link>
        <div className='rounded-xl border border-dashed p-8 text-center'>
          <p className='font-medium'>Test not found</p>
          <p className='mt-2 text-muted-foreground text-sm'>
            The URL doesn’t match any active topic. The test may have been deleted or the slug is wrong.
          </p>
        </div>
      </div>
    )
  return (
    <div className='space-y-6 p-6'>
      <Link
        className='inline-flex items-center gap-1 text-muted-foreground text-sm hover:text-foreground'
        href='/training'>
        <ArrowLeft aria-hidden className='size-3' />
        Training
      </Link>
      <header className='space-y-1'>
        <h1 className='font-semibold text-2xl'>{data.name}</h1>
        <p className='text-muted-foreground text-sm'>
          {data.questions.length} question{data.questions.length === 1 ? '' : 's'} · created {fmtDate(data.createdAt)} ·
          sourced from {data.sourceDocs.length} doc{data.sourceDocs.length === 1 ? '' : 's'}
        </p>
      </header>
      <section className='grid gap-3 md:grid-cols-2 lg:grid-cols-4'>
        <StatCard
          hint={`${data.passedCount} of ${data.totalAssigned} passed`}
          label='Pass rate'
          value={`${data.passRate}%`}
        />
        <StatCard hint='currently assigned' label='Assigned' value={data.totalAssigned} />
        <StatCard
          hint={data.overdueCount === 0 ? 'on track' : 'past deadline'}
          label='Overdue'
          tone={data.overdueCount > 0 ? 'warn' : 'default'}
          value={data.overdueCount}
        />
        <StatCard
          hint={`across ${data.strugglers.filter(s => s.attemptCount > 0).length} people`}
          label='Failed attempts'
          tone={data.failedCount >= 3 ? 'attention' : data.failedCount > 0 ? 'warn' : 'default'}
          value={data.failedCount}
        />
      </section>
      {data.sourceDocs.length > 0 ? (
        <section className='space-y-2'>
          <h2 className='font-semibold text-sm uppercase tracking-wide text-muted-foreground'>Source documents</h2>
          <div className='flex flex-wrap gap-2'>
            {data.sourceDocs.map(d => (
              <button
                className='rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-muted'
                key={d._id}
                onClick={() => openDoc(d._id as Id<'docs'>)}
                type='button'>
                {d.filename}
              </button>
            ))}
          </div>
        </section>
      ) : null}
      <section className='space-y-2'>
        <button
          className='flex items-center gap-2 font-semibold text-sm uppercase tracking-wide text-muted-foreground hover:text-foreground'
          onClick={() => setQuestionsOpen(o => !o)}
          type='button'>
          Question bank ({data.questions.length}) {questionsOpen ? '▾' : '▸'}
        </button>
        {questionsOpen ? (
          <ol className='space-y-2 rounded-lg border bg-card p-4'>
            {data.questions.map((q, i) => (
              <li className='space-y-1 text-sm' key={q.questionId}>
                <div className='font-medium'>
                  {i + 1}. {q.prompt}
                </div>
                <ul className='ml-5 list-disc text-muted-foreground'>
                  {q.choices.map((c, ci) => (
                    <li className={cn(ci === q.correctIndex && 'font-medium text-green-700 dark:text-green-400')} key={c}>
                      {c}
                      {ci === q.correctIndex ? ' ✓' : ''}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        ) : null}
      </section>
      <section className='space-y-2'>
        <h2 className='font-semibold text-lg'>People who passed ({data.winners.length})</h2>
        {data.winners.length === 0 ? (
          <p className='text-muted-foreground text-sm'>Nobody has passed yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Department</TableHead>
                <TableHead className='text-right'>Score</TableHead>
                <TableHead className='text-right'>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.winners.map(w => (
                <TableRow key={w.userId}>
                  <TableCell>
                    <button
                      className='text-left font-medium hover:underline'
                      onClick={() => setDrilldownUser(w.userId)}
                      type='button'>
                      {w.userId}
                    </button>
                  </TableCell>
                  <TableCell className='text-muted-foreground'>{w.department}</TableCell>
                  <TableCell className='text-right tabular-nums'>{w.lastScore ?? '—'}</TableCell>
                  <TableCell className='text-right text-muted-foreground text-xs'>{fmtDate(w.lastAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
      <section className='space-y-2'>
        <h2 className='font-semibold text-lg'>Failing or in progress ({data.strugglers.length})</h2>
        {data.strugglers.length === 0 ? (
          <p className='text-muted-foreground text-sm'>Nobody is struggling.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className='text-right'>Failed attempts</TableHead>
                <TableHead className='text-right'>Last score</TableHead>
                <TableHead className='text-right'>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.strugglers.map(s => (
                <TableRow key={s.userId}>
                  <TableCell>
                    <button
                      className='text-left font-medium hover:underline'
                      onClick={() => setDrilldownUser(s.userId)}
                      type='button'>
                      {s.userId}
                    </button>
                  </TableCell>
                  <TableCell className='text-muted-foreground'>{s.department}</TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs',
                        s.status === 'failed' && 'bg-destructive/15 text-destructive',
                        s.status === 'in-progress' && 'bg-muted text-muted-foreground'
                      )}>
                      {s.status}
                    </span>
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right tabular-nums',
                      s.attemptCount >= 3 && 'font-semibold text-destructive',
                      s.attemptCount > 0 && s.attemptCount < 3 && 'text-yellow-700 dark:text-yellow-400'
                    )}>
                    {s.attemptCount}
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>{s.lastScore ?? '—'}</TableCell>
                  <TableCell className='text-right text-muted-foreground text-xs'>{fmtDate(s.lastAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
      <section className='space-y-2'>
        <h2 className='font-semibold text-lg'>Haven’t started ({data.notStarted.length})</h2>
        {data.notStarted.length === 0 ? (
          <p className='text-muted-foreground text-sm'>Everyone has at least attempted this.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Department</TableHead>
                <TableHead className='text-right'>Deadline</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.notStarted.map(n => (
                <TableRow key={n.userId}>
                  <TableCell>
                    <button
                      className='text-left font-medium hover:underline'
                      onClick={() => setDrilldownUser(n.userId)}
                      type='button'>
                      {n.userId}
                    </button>
                  </TableCell>
                  <TableCell className='text-muted-foreground'>{n.department}</TableCell>
                  <TableCell
                    className={cn(
                      'text-right text-xs',
                      n.lastAt !== undefined &&
                        n.lastAt < Date.now() &&
                        'font-semibold text-yellow-700 dark:text-yellow-400'
                    )}>
                    {fmtDate(n.lastAt)}
                    {n.lastAt !== undefined && n.lastAt < Date.now() ? ' (overdue)' : ''}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
      <AttemptHistoryModal onClose={() => setDrilldownUser(null)} userId={drilldownUser} />
    </div>
  )
}
export default TestDetailPage
