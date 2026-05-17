'use client'
import { Button } from '@a/ui/components/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@a/ui/components/table'
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
    <section className='space-y-3 p-6'>
      <h2 className='font-semibold text-lg'>Quarantine queue ({rows.length})</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Filename</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead className='text-right'>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(r => (
            <TableRow key={r._id}>
              <TableCell>{r.filename}</TableCell>
              <TableCell>{r.owner ?? '(shared)'}</TableCell>
              <TableCell>
                {r.policyStatus} / {r.scanStatus}
              </TableCell>
              <TableCell>{r.policyCategory ?? '—'}</TableCell>
              <TableCell className='max-w-md truncate text-xs'>
                {r.policyReason ?? r.scanOverrideSignature ?? ''}
              </TableCell>
              <TableCell className='text-right space-x-2'>
                <Button
                  disabled={busy.has(r._id)}
                  onClick={() => {
                    // oxlint-disable-next-line promise/prefer-await-to-then, promise/prefer-await-to-callbacks -- React event handler cannot be async (no-misused-promises); .catch is the documented byerag pattern
                    act(r._id, 'approve').catch((error: unknown) => toast.error(String(error)))
                  }}
                  size='xs'
                  type='button'>
                  Approve
                </Button>
                <Button
                  className='border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  disabled={busy.has(r._id)}
                  onClick={() => {
                    // oxlint-disable-next-line promise/prefer-await-to-then, promise/prefer-await-to-callbacks -- React event handler cannot be async (no-misused-promises); .catch is the documented byerag pattern
                    act(r._id, 'reject').catch((error: unknown) => toast.error(String(error)))
                  }}
                  size='xs'
                  type='button'>
                  Confirm reject
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  )
}
export default QuarantinePage
