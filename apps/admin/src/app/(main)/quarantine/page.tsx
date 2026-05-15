'use client'
import { api } from 'backend/convex/_generated/api'
import { useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import { toast } from 'sonner'
const QuarantinePage = (): React.ReactElement => {
  const rows = useQuery(api.docs.listForQuarantine, {})
  const approve = useMutation(api.docs.adminApproveReview)
  const reject = useMutation(api.docs.adminConfirmReject)
  const [busy, setBusy] = useState<Set<string>>(() => new Set())
  const act = async (id: string, kind: 'approve' | 'reject'): Promise<void> => {
    setBusy(p => new Set(p).add(id))
    const fn = kind === 'approve' ? approve : reject
    try {
      await fn({ docId: id as never })
    } catch (error: unknown) {
      toast.error(String(error))
    } finally {
      setBusy(p => {
        const n = new Set(p)
        n.delete(id)
        return n
      })
    }
  }
  if (rows === undefined) return <div className='p-6'>Loading…</div>
  if (rows.length === 0) return <div className='p-6 text-muted-foreground'>No docs awaiting review.</div>
  return (
    <div className='space-y-3 p-6'>
      <h2 className='font-semibold text-lg'>Quarantine queue ({rows.length})</h2>
      <table className='w-full text-sm'>
        <thead>
          <tr className='border-b text-left'>
            <th className='py-2'>Filename</th>
            <th>Owner</th>
            <th>Status</th>
            <th>Category</th>
            <th>Reason</th>
            <th className='text-right'>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr className='border-b' key={r._id}>
              <td className='py-2'>{r.filename}</td>
              <td>{r.owner ?? '(shared)'}</td>
              <td>
                {r.policyStatus} / {r.scanStatus}
              </td>
              <td>{r.policyCategory ?? '—'}</td>
              <td className='max-w-md truncate text-xs'>{r.policyReason ?? r.scanOverrideSignature ?? ''}</td>
              <td className='text-right space-x-2'>
                <button
                  className='rounded-md border bg-primary px-3 py-1 text-primary-foreground text-xs disabled:opacity-50'
                  disabled={busy.has(r._id)}
                  onClick={() => {
                    undefined
                  }}
                  type='button'>
                  Approve
                </button>
                <button
                  className='rounded-md border bg-destructive px-3 py-1 text-destructive-foreground text-xs disabled:opacity-50'
                  disabled={busy.has(r._id)}
                  onClick={() => {
                    undefined
                  }}
                  type='button'>
                  Confirm reject
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
export default QuarantinePage
