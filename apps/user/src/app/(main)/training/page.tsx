'use client'
import { useMutation, useQuery } from 'convex/react'
import { api } from 'backend/convex/_generated/api'
import { useState } from 'react'
const TrainingPage = (): React.ReactElement => {
  const topics = useQuery(api.training.listMyTopics)
  const startAttempt = useMutation(api.trainingAttempts.startAttempt)
  const [starting, setStarting] = useState<Set<string>>(new Set())
  const onStart = (topicId: string): void => {
    setStarting(p => new Set(p).add(topicId))
    startAttempt({ topicId: topicId as never })
      .then(r => {
        window.location.href = `/training/${r.attemptId}`
      })
      .catch(e => {
        // eslint-disable-next-line no-console
        console.error('start failed', e)
      })
      .finally(() => setStarting(p => { const n = new Set(p); n.delete(topicId); return n }))
  }
  if (topics === undefined) return <div className="p-6">Loading…</div>
  if (topics.length === 0) return <div className="p-6 text-muted-foreground">No topics available yet.</div>
  return (
    <div className="space-y-4 p-6">
      <h2 className="font-semibold text-lg">Training topics</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Topic</th>
            <th className="text-right">Pool</th>
            <th>Status</th>
            <th className="text-right">Start</th>
          </tr>
        </thead>
        <tbody>
          {topics.map(t => (
            <tr key={t._id} className="border-b">
              <td className="py-2">{t.name}</td>
              <td className="text-right">{t.poolSize}</td>
              <td>
                {t.myStatus === 'passed-assigned' ? '✓ passed (assigned)' :
                 t.myStatus === 'passed-self' ? '✓ passed (self)' :
                 t.myStatus === 'not-attempted' ? '—' : t.myStatus}
              </td>
              <td className="text-right">
                <button
                  type="button"
                  className="rounded-md border bg-primary px-3 py-1 text-primary-foreground text-sm disabled:opacity-50"
                  disabled={t.poolSize < 5 || starting.has(t._id) || t.myStatus.startsWith('passed-')}
                  onClick={() => onStart(t._id)}>
                  {starting.has(t._id) ? 'Starting…' : 'Start (5 random)'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
export default TrainingPage
