'use client'
import { useQuery } from 'convex/react'
import { api } from 'backend/convex/_generated/api'
const AuditPage = (): React.ReactElement => {
  const rows = useQuery(api.lib.listAuditLogsForAdmin, { limit: 200 })
  if (rows === undefined) return <div className="p-6">Loading…</div>
  if (rows.length === 0) return <div className="p-6 text-muted-foreground">No audit rows or admin role required.</div>
  return (
    <div className="space-y-2 p-6">
      <h2 className="font-semibold text-lg">Audit log (latest 200)</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">At</th>
            <th>Owner</th>
            <th>Command</th>
            <th>Mode</th>
            <th>OK</th>
            <th>Severity</th>
            <th>Args</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r._id} className="border-b">
              <td className="py-1 font-mono text-xs">{new Date(r._creationTime).toISOString().slice(0, 19).replace('T', ' ')}</td>
              <td>{r.owner}</td>
              <td className="font-mono text-xs">{r.command}</td>
              <td>{r.mode}</td>
              <td>{r.ok ? '✓' : '✗'}</td>
              <td>{r.severity ?? '—'}</td>
              <td className="max-w-md truncate font-mono text-xs" title={r.args}>{r.args}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
export default AuditPage
