'use client'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@a/ui/components/table'
import { api } from 'backend/convex/_generated/api'
import { useQuery } from 'convex/react'
import { use } from 'react'
const fmt = (n?: number): string => (n === undefined ? '—' : new Date(n).toISOString().slice(0, 19).replace('T', ' '))
const UserTopicDetailPage = ({ params }: { params: Promise<{ topicId: string; userId: string }> }): React.ReactElement => {
  const { userId, topicId } = use(params)
  const rows = useQuery(api.training.listAttemptsForAdmin, { topicId: topicId as never, userId })
  if (rows === undefined) return <div className='p-6'>Loading…</div>
  return (
    <section className='space-y-3 p-6'>
      <h2 className='font-semibold text-lg'>
        {userId} on topic {topicId.slice(-6)}
      </h2>
      <p className='text-muted-foreground text-sm'>{rows.length} attempt(s)</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Kind</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Score</TableHead>
            <TableHead>Started</TableHead>
            <TableHead>Finished</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(r => (
            <TableRow key={r._id}>
              <TableCell>{r.kind}</TableCell>
              <TableCell>{r.status}</TableCell>
              <TableCell>{r.score ?? '—'}/5</TableCell>
              <TableCell className='text-xs'>{fmt(r.startedAt)}</TableCell>
              <TableCell className='text-xs'>{fmt(r.finishedAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  )
}
export default UserTopicDetailPage
