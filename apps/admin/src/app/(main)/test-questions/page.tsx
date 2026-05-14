'use client'
import { useMutation, useQuery } from 'convex/react'
import { api } from 'backend/convex/_generated/api'
import { useState } from 'react'
const TestQuestionsPage = (): React.ReactElement => {
  const rows = useQuery(api.training.listPendingSuggestionsForAdmin, {})
  const approve = useMutation(api.training.approveSuggestionPublic)
  const [pending, setPending] = useState<Set<string>>(new Set())
  const onApprove = (id: string): void => {
    setPending(p => new Set(p).add(id))
    approve({ suggestionId: id as never })
      .catch(e => {
        // eslint-disable-next-line no-console
        console.error('approve failed', e)
      })
      .finally(() => setPending(p => { const n = new Set(p); n.delete(id); return n }))
  }
  if (rows === undefined) return <div className="p-6">Loading…</div>
  if (rows.length === 0) return <div className="p-6 text-muted-foreground">No pending suggestions. Admin role required for this page.</div>
  return (
    <div className="space-y-4 p-6">
      <h2 className="font-semibold text-lg">Pending question suggestions ({rows.length})</h2>
      {rows.map(r => (
        <div key={r._id} className="rounded-md border p-4 space-y-2">
          <div className="text-muted-foreground text-xs">topic={r.topicId}</div>
          <div className="font-medium">{r.prompt ?? '(no prompt)'}</div>
          <ol className="list-decimal list-inside text-sm space-y-1">
            {(r.choices ?? []).map((c, i) => (
              <li key={c} className={i === r.correctIndex ? 'font-semibold' : ''}>
                {c} {i === r.correctIndex && <span className="text-green-600">✓</span>}
              </li>
            ))}
          </ol>
          <button
            type="button"
            className="rounded-md border bg-primary px-3 py-1 text-primary-foreground text-sm disabled:opacity-50"
            disabled={pending.has(r._id)}
            onClick={() => onApprove(r._id)}>
            {pending.has(r._id) ? 'Approving…' : 'Approve'}
          </button>
        </div>
      ))}
    </div>
  )
}
export default TestQuestionsPage
