'use client'
import { cn } from '@a/ui'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@a/ui/components/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@a/ui/components/table'
import { api } from 'backend/convex/_generated/api'
import { useQuery } from 'convex/react'

interface Props {
  onClose: () => void
  userId: null | string
}
const AttemptHistoryModal = ({ userId, onClose }: Props): React.ReactElement => {
  const drilldown = useQuery(api.dashboard.userAttemptHistory, userId ? { userId } : 'skip')
  return (
    <Dialog
      onOpenChange={open => {
        if (!open) onClose()
      }}
      open={userId !== null}>
      <DialogContent className='max-w-2xl'>
        <DialogHeader>
          <DialogTitle>Attempt history</DialogTitle>
          <DialogDescription>{userId ? <span className='font-mono text-xs'>{userId}</span> : null}</DialogDescription>
        </DialogHeader>
        {drilldown === undefined ? (
          <div className='text-muted-foreground text-sm'>Loading…</div>
        ) : drilldown === null ? (
          <div className='text-destructive text-sm'>Not found.</div>
        ) : drilldown.attempts.length === 0 ? (
          <div className='text-muted-foreground text-sm'>No attempts yet.</div>
        ) : (
          <div className='space-y-3'>
            {drilldown.failedTopics.length > 0 ? (
              <div className='rounded-md bg-destructive/10 px-3 py-2 text-sm'>
                <span className='font-medium text-destructive'>Repeatedly failed:</span>{' '}
                <span className='text-foreground'>{drilldown.failedTopics.join(', ')}</span>
              </div>
            ) : null}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Topic</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className='text-right'>Score</TableHead>
                  <TableHead className='text-right'>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drilldown.attempts.map(a => (
                  <TableRow key={`${a.topicName}-${a.startedAt}`}>
                    <TableCell className='font-medium'>{a.topicName}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs',
                          a.status === 'passed' && 'bg-green-500/15 text-green-700 dark:text-green-400',
                          a.status === 'failed' && 'bg-destructive/15 text-destructive',
                          a.status === 'in-progress' && 'bg-muted text-muted-foreground',
                          a.status === 'cancelled' && 'bg-muted/50 text-muted-foreground'
                        )}>
                        {a.status}
                      </span>
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>{a.score ?? '—'}</TableCell>
                    <TableCell className='text-right text-muted-foreground text-xs'>
                      {new Date(a.finishedAt ?? a.startedAt).toISOString().slice(0, 10)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
export { AttemptHistoryModal }
