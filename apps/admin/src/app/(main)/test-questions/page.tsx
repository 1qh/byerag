'use client'
import { cn } from '@a/ui'
import { api } from 'backend/convex/_generated/api'
import { useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import { toast } from 'sonner'
const TestQuestionsPage = (): React.ReactElement => {
  const rows = useQuery(api.training.listPendingSuggestionsForAdmin, {})
  const approve = useMutation(api.training.approveSuggestionPublic)
  const reject = useMutation(api.training.rejectSuggestionPublic)
  const [pending, setPending] = useState<Set<string>>(() => new Set())
  const act = async (id: string, kind: 'approve' | 'reject'): Promise<void> => {
    setPending(p => new Set(p).add(id))
    const fn = kind === 'approve' ? approve : reject
    try {
      await fn({ suggestionId: id as never })
    } catch (error: unknown) {
      toast.error(String(error))
    } finally {
      setPending(p => {
        const n = new Set(p)
        n.delete(id)
        return n
      })
    }
  }
  if (rows === undefined) return <div className='p-6'>Loading…</div>
  if (rows.length === 0) return <div className='p-6 text-muted-foreground'>No pending suggestions.</div>
  const byTopic = new Map<string, typeof rows>()
  for (const r of rows) {
    const list = byTopic.get(r.topicName) ?? []
    list.push(r)
    byTopic.set(r.topicName, list)
  }
  return (
    <div className='space-y-6 p-6'>
      <h2 className='font-semibold text-lg'>Pending question suggestions ({rows.length})</h2>
      {[...byTopic.entries()].map(([topicName, items]) => (
        <section className='space-y-2' key={topicName}>
          <h3 className='font-medium'>
            {topicName} <span className='text-muted-foreground text-sm'>({items.length})</span>
          </h3>
          {items.map(r => (
            <div
              className={cn('rounded-md border p-4 space-y-2', r.pairKind === 'conflict' && 'border-yellow-500')}
              key={r._id}>
              {r.pairKind ? (
                <div className='text-xs text-yellow-700'>
                  ⚠{' '}
                  {r.pairKind === 'conflict'
                    ? `Possible duplicate of existing pending suggestion ${r.pairedWith?.slice(-6)}`
                    : 'Cap-swap pair'}
                </div>
              ) : null}
              <div className='font-medium'>{r.prompt ?? '(no prompt)'}</div>
              <ol className='list-decimal list-inside text-sm space-y-1'>
                {(r.choices ?? []).map((c, i) => (
                  <li className={cn(i === r.correctIndex && 'font-semibold')} key={c}>
                    {c} {i === r.correctIndex && <span className='text-green-600'>✓</span>}
                  </li>
                ))}
              </ol>
              <div className='space-x-2'>
                <button
                  className='rounded-md border bg-primary px-3 py-1 text-primary-foreground text-sm disabled:opacity-50'
                  disabled={pending.has(r._id)}
                  onClick={() => {
                    // oxlint-disable-next-line promise/prefer-await-to-then, promise/prefer-await-to-callbacks -- React event handler cannot be async (no-misused-promises); .catch is the documented byerag pattern
                    act(r._id, 'approve').catch((error: unknown) => toast.error(String(error)))
                  }}
                  type='button'>
                  {pending.has(r._id) ? '…' : 'Approve'}
                </button>
                <button
                  className='rounded-md border bg-destructive px-3 py-1 text-destructive-foreground text-sm disabled:opacity-50'
                  disabled={pending.has(r._id)}
                  onClick={() => {
                    // oxlint-disable-next-line promise/prefer-await-to-then, promise/prefer-await-to-callbacks -- React event handler cannot be async (no-misused-promises); .catch is the documented byerag pattern
                    act(r._id, 'reject').catch((error: unknown) => toast.error(String(error)))
                  }}
                  type='button'>
                  {pending.has(r._id) ? '…' : 'Reject'}
                </button>
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
export default TestQuestionsPage
