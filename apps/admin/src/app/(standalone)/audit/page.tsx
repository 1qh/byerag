'use client'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@a/ui/components/table'
import { api } from 'backend/convex/_generated/api'
import { useQuery } from 'convex/react'
const AuditPage = (): React.ReactElement => {
  const rows = useQuery(api.lib.listAuditLogsForAdmin, { limit: 200 })
  if (rows === undefined) return <div className='p-6'>Loading…</div>
  if (rows.length === 0) return <div className='p-6 text-muted-foreground'>No audit rows or admin role required.</div>
  return (
    <section className='space-y-2 p-6'>
      <h2 className='font-semibold text-lg'>Audit log (latest 200)</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>At</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Command</TableHead>
            <TableHead>Mode</TableHead>
            <TableHead>OK</TableHead>
            <TableHead>Severity</TableHead>
            <TableHead>Args</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(r => (
            <TableRow key={r._id}>
              <TableCell className='font-mono text-xs'>
                {new Date(r._creationTime).toISOString().slice(0, 19).replace('T', ' ')}
              </TableCell>
              <TableCell>{r.owner}</TableCell>
              <TableCell className='font-mono text-xs'>{r.command}</TableCell>
              <TableCell>{r.mode}</TableCell>
              <TableCell>{r.ok ? '✓' : '✗'}</TableCell>
              <TableCell>{r.severity ?? '—'}</TableCell>
              <TableCell className='max-w-md truncate font-mono text-xs' title={r.args}>
                {r.args}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  )
}
export default AuditPage
