'use client'
import { cn } from '@a/ui'
import { Button } from '@a/ui/components/button'
import { Checkbox } from '@a/ui/components/checkbox'
import { api } from 'backend/convex/_generated/api'
import { useMutation, useQuery } from 'convex/react'
import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'
const TestQuestionsPage = (): React.ReactElement => {
  const rows = useQuery(api.training.listPendingSuggestionsForAdmin, {})
  const approve = useMutation(api.training.approveSuggestionPublic)
  const reject = useMutation(api.training.rejectSuggestionPublic)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const toggle = (id: string): void =>
    setSelected(p => {
      const n = new Set(p)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const toggleAll = (ids: string[]): void =>
    setSelected(p => {
      const allOn = ids.every(i => p.has(i))
      const n = new Set(p)
      for (const i of ids)
        if (allOn) n.delete(i)
        else n.add(i)
      return n
    })
  const bulkAct = async (kind: 'approve' | 'reject'): Promise<void> => {
    if (selected.size === 0) return
    setBulkBusy(true)
    const ids = [...selected]
    const fn = kind === 'approve' ? approve : reject
    let ok = 0
    let fail = 0
    for (const id of ids)
      try {
        await fn({ suggestionId: id as never })
        ok += 1
      } catch (error: unknown) {
        fail += 1
        toast.error(`${id.slice(-6)}: ${String(error).slice(0, 80)}`)
      }
    toast.success(`${kind} ${ok}/${ids.length}${fail > 0 ? ` (${fail} failed)` : ''}`)
    setSelected(new Set())
    setBulkBusy(false)
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
      <div className='-mx-6 -mt-6 sticky top-0 z-10 mb-2 flex items-center gap-3 border-b bg-background p-6'>
        <h2 className='font-semibold text-lg'>Pending question suggestions ({rows.length})</h2>
        <span className='text-muted-foreground text-sm'>{selected.size} selected</span>
        <Button
          disabled={bulkBusy || selected.size === 0}
          onClick={() => {
            // oxlint-disable-next-line promise/prefer-await-to-then, promise/prefer-await-to-callbacks -- React handler
            bulkAct('approve').catch((error: unknown) => toast.error(String(error)))
          }}
          size='sm'>
          Approve selected
        </Button>
        <Button
          disabled={bulkBusy || selected.size === 0}
          onClick={() => {
            // oxlint-disable-next-line promise/prefer-await-to-then, promise/prefer-await-to-callbacks -- React handler
            bulkAct('reject').catch((error: unknown) => toast.error(String(error)))
          }}
          size='sm'
          variant='destructive'>
          Reject selected
        </Button>
        <Button onClick={() => setSelected(new Set(rows.map(r => r._id)))} size='sm' variant='outline'>
          Select all
        </Button>
        <Button onClick={() => setSelected(new Set())} size='sm' variant='ghost'>
          Clear
        </Button>
      </div>
      {[...byTopic.entries()].map(([topicName, items]) => {
        const topicIds = items.map(i => i._id)
        const allOn = topicIds.every(i => selected.has(i))
        return (
          <section className='space-y-2' key={topicName}>
            <h3 className='flex items-center gap-2 font-medium'>
              <Checkbox
                aria-label={`Select all in ${topicName}`}
                checked={allOn}
                onCheckedChange={() => toggleAll(topicIds)}
              />
              {topicName} <span className='text-muted-foreground text-sm'>({items.length})</span>
            </h3>
            {items.map(r => (
              <div
                className={cn('space-y-2 rounded-md border p-4', r.pairKind === 'conflict' && 'border-yellow-500')}
                key={r._id}>
                <div className='flex items-start gap-3'>
                  <Checkbox
                    aria-label={`Select suggestion ${r._id.slice(-6)}`}
                    checked={selected.has(r._id)}
                    className='mt-1'
                    onCheckedChange={() => toggle(r._id)}
                  />
                  <div className='flex-1 space-y-2'>
                    {r.pairKind ? (
                      <div className='text-xs text-yellow-700'>
                        ⚠{' '}
                        {r.pairKind === 'conflict'
                          ? `Possible duplicate of pending ${r.pairedWith?.slice(-6) ?? ''}`
                          : 'Cap-swap pair'}
                      </div>
                    ) : null}
                    <div className='font-medium'>{r.prompt ?? '(no prompt)'}</div>
                    <ol className='list-inside list-decimal space-y-1 text-sm'>
                      {(r.choices ?? []).map((c, i) => (
                        <li className={cn(i === r.correctIndex && 'font-semibold')} key={c}>
                          {c} {i === r.correctIndex && <span className='text-green-600'>✓</span>}
                        </li>
                      ))}
                    </ol>
                    {r.sourceDocs.length > 0 ? (
                      <div className='flex flex-wrap items-center gap-1 text-xs'>
                        <span className='text-muted-foreground'>source:</span>
                        {r.sourceDocs.map(d => (
                          <Link
                            className='rounded border bg-muted px-1.5 py-0.5 font-mono hover:bg-accent'
                            href={`/docs/${d._id}`}
                            key={d._id}>
                            {d.filename}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </section>
        )
      })}
    </div>
  )
}
export default TestQuestionsPage
