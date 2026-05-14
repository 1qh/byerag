'use client'
import { useQuery } from 'convex/react'
import { api } from 'backend/convex/_generated/api'
import { use } from 'react'
const fmt = (n?: number): string => (n === undefined ? '—' : new Date(n).toISOString().slice(0, 19).replace('T', ' '))
const UserTopicDetailPage = ({ params }: { params: Promise<{ topicId: string; userId: string }> }): React.ReactElement => {
  const { userId, topicId } = use(params)
  const rows = useQuery(api.training.listAttemptsForAdmin, { topicId: topicId as never, userId })
  if (rows === undefined) return <div className="p-6">Loading…</div>
  return (
    <div className="space-y-3 p-6">
      <h2 className="font-semibold text-lg">{userId} on topic {topicId.slice(-6)}</h2>
      <p className="text-muted-foreground text-sm">{rows.length} attempt(s)</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Kind</th>
            <th>Status</th>
            <th>Score</th>
            <th>Started</th>
            <th>Finished</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r._id} className="border-b">
              <td className="py-2">{r.kind}</td>
              <td>{r.status}</td>
              <td>{r.score ?? '—'}/5</td>
              <td className="text-xs">{fmt(r.startedAt)}</td>
              <td className="text-xs">{fmt(r.finishedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
export default UserTopicDetailPage
