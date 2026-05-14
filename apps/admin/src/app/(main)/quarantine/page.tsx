'use client'
import { useQuery } from 'convex/react'
import { api } from 'backend/convex/_generated/api'
const QuarantinePage = (): React.ReactElement => {
  const rows = useQuery(api.docs.listForQuarantine, {})
  if (rows === undefined) return <div className="p-6">Loading…</div>
  if (rows.length === 0) return <div className="p-6 text-muted-foreground">No docs awaiting review.</div>
  return (
    <div className="space-y-3 p-6">
      <h2 className="font-semibold text-lg">Quarantine queue ({rows.length})</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Filename</th>
            <th>Owner</th>
            <th>Status</th>
            <th>Category</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r._id} className="border-b">
              <td className="py-2">{r.filename}</td>
              <td>{r.owner ?? '(shared)'}</td>
              <td>{r.policyStatus} / {r.scanStatus}</td>
              <td>{r.policyCategory ?? '—'}</td>
              <td className="max-w-md truncate text-xs">{r.policyReason ?? r.scanOverrideSignature ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
export default QuarantinePage
