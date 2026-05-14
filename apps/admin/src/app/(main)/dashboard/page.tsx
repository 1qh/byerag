'use client'
import { cn } from '@a/ui'
import { api } from 'backend/convex/_generated/api'
import { useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import { toast } from 'sonner'
const fmtCents = (cents: number): string => `$${(cents / 100).toFixed(2)}`
const DashboardPage = (): React.ReactElement => {
  const top = useQuery(api.dashboard.topStrip)
  const history = useQuery(api.dashboard.costCycleHistory, { count: 6 })
  const [selectedCycle, setSelectedCycle] = useState<string | undefined>(undefined)
  const pivot = useQuery(api.dashboard.costCyclePivot, { cycleStart: selectedCycle })
  const [gradeNonce, setGradeNonce] = useState<null | number>(null)
  const grade = useQuery(api.dashboard.gradebook, gradeNonce === null ? 'skip' : {})
  const assignAll = useMutation(api.trainingAssignments.assignAllForTopic)
  const unassignAll = useMutation(api.trainingAssignments.unassignAllForTopic)
  const rearm = useMutation(api.training.markTopicSubstantive)
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const onTopicAction = (topicId: string, kind: 'assign' | 'rearm' | 'unassign'): void => {
    setBusy(p => new Set(p).add(`${topicId}|${kind}`))
    const fn = kind === 'assign' ? assignAll : kind === 'unassign' ? unassignAll : rearm
    fn({ topicId: topicId as never })
      .catch((error: unknown) => {
        toast.error(String(error))
      })
      .finally(() => {
        setBusy(p => {
          const n = new Set(p)
          n.delete(`${topicId}|${kind}`)
          return n
        })
      })
  }
  if (top === undefined || pivot === undefined) return <div className='p-6'>Loading…</div>
  if (top === null) return <div className='p-6 text-destructive'>Admin role required.</div>
  return (
    <div className='space-y-8 p-6'>
      <section className='grid grid-cols-3 gap-4'>
        <div className='rounded-md border p-4'>
          <div className='text-muted-foreground text-sm'>Total users</div>
          <div className='font-bold text-2xl'>{top.totalUsers}</div>
        </div>
        <div className='rounded-md border p-4'>
          <div className='text-muted-foreground text-sm'>Cost cycle (from {top.cycleStart})</div>
          <div className='font-bold text-2xl'>{fmtCents(top.cycleCents)}</div>
        </div>
        <div className='rounded-md border p-4'>
          <div className='text-muted-foreground text-sm'>Docs in corpus</div>
          <div className='font-bold text-2xl'>{top.docsInCorpus}</div>
        </div>
      </section>
      {history && history.length > 0 ? (
        <section>
          <h2 className='mb-2 font-semibold text-lg'>Cost history (last {history.length} cycles)</h2>
          <div className='flex items-end gap-2'>
            {[...history].toReversed().map(c => {
              const maxCents = Math.max(1, ...history.map(h => h.cents))
              const heightPct = Math.max(2, (c.cents / maxCents) * 100)
              return (
                <button
                  className={cn(
                    'flex flex-col items-center gap-1 text-xs',
                    selectedCycle === c.cycleStart && 'font-semibold'
                  )}
                  key={c.cycleStart}
                  onClick={() => {
                    setSelectedCycle(c.cycleStart === selectedCycle ? undefined : c.cycleStart)
                  }}
                  type='button'>
                  <div className='text-muted-foreground'>{fmtCents(c.cents)}</div>
                  <div
                    className={cn(
                      'w-12 rounded-t',
                      c.isCurrent ? 'animate-pulse bg-primary/60' : 'bg-primary',
                      selectedCycle === c.cycleStart && 'ring-2 ring-foreground'
                    )}
                    style={{ height: `${heightPct}px` }}
                  />
                  <div>{c.cycleStart.slice(5)}</div>
                </button>
              )
            })}
          </div>
        </section>
      ) : null}
      <section>
        <h2 className='mb-2 font-semibold text-lg'>
          Cost pivot ({selectedCycle ? `cycle from ${selectedCycle}` : 'current cycle'})
        </h2>
        <table className='w-full text-sm'>
          <thead>
            <tr className='border-b text-left'>
              <th className='py-2'>Owner</th>
              <th>Model</th>
              <th className='text-right'>Input</th>
              <th className='text-right'>Output</th>
              <th className='text-right'>Cost</th>
            </tr>
          </thead>
          <tbody>
            {pivot.length === 0 ? (
              <tr>
                <td className='py-4 text-muted-foreground' colSpan={5}>
                  No usage yet this cycle.
                </td>
              </tr>
            ) : (
              pivot.map(r => (
                <tr className='border-b' key={`${r.owner}|${r.model}`}>
                  <td className='py-2'>
                    <a className='hover:underline' href={`/users/${encodeURIComponent(r.owner)}/cost`}>
                      {r.owner}
                    </a>
                  </td>
                  <td>{r.model}</td>
                  <td className='text-right'>{r.inputTokens.toLocaleString()}</td>
                  <td className='text-right'>{r.outputTokens.toLocaleString()}</td>
                  <td className='text-right'>{fmtCents(r.cents)}</td>
                </tr>
              ))
            )}
          </tbody>
          {pivot.length > 0 && (
            <tfoot>
              <tr className='border-t-2 font-semibold'>
                <td className='py-2' colSpan={2}>
                  Total
                </td>
                <td className='text-right'>{pivot.reduce((s, r) => s + r.inputTokens, 0).toLocaleString()}</td>
                <td className='text-right'>{pivot.reduce((s, r) => s + r.outputTokens, 0).toLocaleString()}</td>
                <td className='text-right'>{fmtCents(pivot.reduce((s, r) => s + r.cents, 0))}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </section>
      <section>
        <h2 className='mb-2 flex items-center gap-3 font-semibold text-lg'>
          Gradebook{grade ? ` (${grade.users.length} × ${grade.topics.length})` : ''}
          <button
            className='rounded border px-2 py-1 text-xs'
            onClick={() => {
              setGradeNonce(Date.now())
            }}
            type='button'>
            {gradeNonce === null ? 'Load' : 'Refresh'}
          </button>
        </h2>
        {grade ? (
          grade.topics.length === 0 ? (
            <div className='text-muted-foreground'>No topics with pool ≥ 5 yet.</div>
          ) : (
            <table className='text-sm'>
              <thead>
                <tr className='border-b'>
                  <th className='py-2 pr-3 text-left'>User</th>
                  <th className='pr-3 text-left'>Dept</th>
                  {grade.topics.map(t => (
                    <th className='px-2 text-center' key={t._id} title={t.name}>
                      <div>{t.name.slice(0, 8)}</div>
                      <div className='space-x-1'>
                        <button
                          className='rounded border px-1 text-xs disabled:opacity-50'
                          disabled={busy.has(`${t._id}|assign`)}
                          onClick={() => onTopicAction(t._id, 'assign')}
                          title='Assign to all role=user'
                          type='button'>
                          +
                        </button>
                        <button
                          className='rounded border px-1 text-xs disabled:opacity-50'
                          disabled={busy.has(`${t._id}|rearm`)}
                          onClick={() => onTopicAction(t._id, 'rearm')}
                          title='Mark substantive — re-arm assigned passes'
                          type='button'>
                          ↻
                        </button>
                        <button
                          className='rounded border px-1 text-xs disabled:opacity-50'
                          disabled={busy.has(`${t._id}|unassign`)}
                          onClick={() => onTopicAction(t._id, 'unassign')}
                          title='Un-assign all'
                          type='button'>
                          ×
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grade.users.map(u => (
                  <tr className='border-b' key={u.userId}>
                    <td className='py-2 pr-3'>{u.userId}</td>
                    <td className='pr-3 text-muted-foreground'>{u.department ?? '—'}</td>
                    {grade.topics.map(t => {
                      const cell = grade.cells.find(c => c.userId === u.userId && c.topicId === t._id)
                      return (
                        <td className='px-2 text-center font-mono' key={t._id}>
                          <a className='hover:underline' href={`/users/${encodeURIComponent(u.userId)}/topics/${t._id}`}>
                            {cell?.glyph ?? '·'}
                          </a>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          <div className='text-muted-foreground'>{gradeNonce === null ? 'Click Load to fetch.' : 'Loading…'}</div>
        )}
      </section>
    </div>
  )
}
export default DashboardPage
