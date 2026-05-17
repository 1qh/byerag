'use client'
import { cn } from '@a/ui'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@a/ui/components/alert-dialog'
import { Badge } from '@a/ui/components/badge'
import { Button } from '@a/ui/components/button'
import { Checkbox } from '@a/ui/components/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@a/ui/components/dropdown-menu'
import { Switch } from '@a/ui/components/switch'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@a/ui/components/table'
import { api } from 'backend/convex/_generated/api'
import { useMutation, useQuery } from 'convex/react'
import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'
type ActionKind = 'assign' | 'assignSelected' | 'rearm' | 'unassign'
interface PendingAction {
  kind: ActionKind
  poolSize: number
  topicId: string
  topicName: string
  userIds?: string[]
}
const fmtCents = (cents: number): string => `$${(cents / 100).toFixed(2)}`
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const cycleLabel = (cycleStart: string): string => {
  const [y, m] = cycleStart.split('-')
  const mi = Number(m) - 1
  return `${MONTH_ABBR[mi] ?? m} ${y}`
}
const ACTION_COPY: Record<ActionKind, { confirm: string; desc: string; title: string }> = {
  assign: {
    confirm: 'Assign to all',
    desc: 'Assigns this test to every user account. Anyone who already passed it (assigned) or has a live assignment is skipped automatically.',
    title: 'Assign test to all users?'
  },
  assignSelected: {
    confirm: 'Assign to selected',
    desc: 'Assigns this test only to the users you checked. Anyone already passed (assigned) or with a live assignment is skipped.',
    title: 'Assign test to selected users?'
  },
  rearm: {
    confirm: 'Mark substantive',
    desc: 'Marks the corpus change substantive: every assigned-pass earned before now is revoked and those users are re-assigned. Self-passes are untouched.',
    title: 'Mark substantive and re-arm?'
  },
  unassign: {
    confirm: 'Un-assign all',
    desc: 'Removes every assignment for this topic and cancels in-progress assigned attempts. Past pass records are kept. The agent cron may refill if auto-assign is on.',
    title: 'Un-assign all users?'
  }
}
const DashboardPage = (): React.ReactElement => {
  const top = useQuery(api.dashboard.topStrip)
  const history = useQuery(api.dashboard.costCycleHistory, { count: 6 })
  const [selectedCycle, setSelectedCycle] = useState<string | undefined>(undefined)
  const pivot = useQuery(api.dashboard.costCyclePivot, { cycleStart: selectedCycle })
  const [gradeNonce, setGradeNonce] = useState<null | number>(null)
  const grade = useQuery(api.dashboard.gradebook, gradeNonce === null ? 'skip' : {})
  const autoAssign = useQuery(api.settings.getForAdmin, { key: 'agent_auto_assign_enabled' })
  const setSetting = useMutation(api.settings.setForAdmin)
  const assignAll = useMutation(api.trainingAssignments.assignAllForTopic)
  const assignUsers = useMutation(api.trainingAssignments.assignUsersForTopic)
  const unassignAll = useMutation(api.trainingAssignments.unassignAllForTopic)
  const rearm = useMutation(api.training.markTopicSubstantive)
  const [pending, setPending] = useState<null | PendingAction>(null)
  const [running, setRunning] = useState(false)
  const [autoBusy, setAutoBusy] = useState(false)
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(() => new Set())
  const toggleUser = (userId: string): void =>
    setSelectedUsers(p => {
      const n = new Set(p)
      if (n.has(userId)) n.delete(userId)
      else n.add(userId)
      return n
    })
  const toggleAuto = async (next: boolean): Promise<void> => {
    setAutoBusy(true)
    try {
      await setSetting({ key: 'agent_auto_assign_enabled', value: next ? 'true' : 'false' })
      toast.success(`Agent auto-assign ${next ? 'enabled' : 'disabled'}`)
    } catch (error: unknown) {
      toast.error(String(error))
    } finally {
      setAutoBusy(false)
    }
  }
  const runPending = async (): Promise<void> => {
    if (!pending) return
    setRunning(true)
    try {
      const id = pending.topicId as never
      if (pending.kind === 'assign') {
        const r = await assignAll({ topicId: id })
        toast.success(`Assigned ${pending.topicName}: ${r.assignmentsCreated} new`)
      } else if (pending.kind === 'assignSelected') {
        const r = await assignUsers({ topicId: id, userIds: pending.userIds ?? [] })
        toast.success(`Assigned ${pending.topicName}: ${r.assignmentsCreated} new, ${r.skipped} skipped`)
      } else if (pending.kind === 'unassign') {
        const r = await unassignAll({ topicId: id })
        toast.success(`Un-assigned ${pending.topicName}: ${r.assignmentsCancelled} removed`)
      } else {
        const r = await rearm({ topicId: id })
        toast.success(`${pending.topicName}: ${r.passesRevoked} revoked, ${r.assignmentsCreated} re-assigned`)
      }
      setPending(null)
    } catch (error: unknown) {
      toast.error(String(error))
    } finally {
      setRunning(false)
    }
  }
  if (top === undefined || pivot === undefined) return <div className='p-6'>Loading…</div>
  if (top === null) return <div className='p-6 text-destructive'>Admin role required.</div>
  return (
    <div className='space-y-8 p-6'>
      <section className='grid grid-cols-3 gap-4'>
        <div className='rounded-md border p-4'>
          <div className='text-muted-foreground text-sm'>Total users</div>
          <div className='font-bold text-2xl'>{top.totalUsers}</div>
        </div>
        <div className='rounded-md border p-4'>
          <div className='text-muted-foreground text-sm'>Cost cycle (from {top.cycleStart})</div>
          <div className='font-bold text-2xl'>{fmtCents(top.cycleCents)}</div>
        </div>
        <div className='rounded-md border p-4'>
          <div className='text-muted-foreground text-sm'>Docs in corpus</div>
          <div className='font-bold text-2xl'>{top.docsInCorpus}</div>
        </div>
      </section>
      {history && history.length > 0 ? (
        <section>
          <h2 className='mb-2 font-semibold text-lg'>Cost history (last {history.length} cycles)</h2>
          <div className='flex items-end gap-2'>
            {[...history].toReversed().map(c => {
              const maxCents = Math.max(1, ...history.map(h => h.cents))
              const heightPct = Math.max(2, (c.cents / maxCents) * 100)
              // oxlint-disable-next-line react-perf/jsx-no-new-object-as-prop -- height varies per bar
              const barStyle: React.CSSProperties = { height: `${heightPct}px` }
              return (
                <button
                  className={cn(
                    'flex flex-col items-center gap-1 text-xs',
                    selectedCycle === c.cycleStart && 'font-semibold'
                  )}
                  key={c.cycleStart}
                  onClick={() => {
                    setSelectedCycle(c.cycleStart === selectedCycle ? undefined : c.cycleStart)
                  }}
                  type='button'>
                  <div className='text-muted-foreground'>{fmtCents(c.cents)}</div>
                  <div
                    className={cn(
                      'w-12 rounded-t',
                      c.isCurrent ? 'animate-pulse bg-primary/60' : 'bg-primary',
                      selectedCycle === c.cycleStart && 'ring-2 ring-foreground'
                    )}
                    style={barStyle}
                  />
                  <div>{cycleLabel(c.cycleStart)}</div>
                </button>
              )
            })}
          </div>
        </section>
      ) : null}
      <section>
        <h2 className='mb-2 font-semibold text-lg'>
          Cost pivot ({selectedCycle ? `cycle from ${selectedCycle}` : 'current cycle'})
        </h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Owner</TableHead>
              <TableHead>Model</TableHead>
              <TableHead className='text-right'>Input</TableHead>
              <TableHead className='text-right'>Output</TableHead>
              <TableHead className='text-right'>Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pivot.length === 0 ? (
              <TableRow>
                <TableCell className='text-muted-foreground' colSpan={5}>
                  No usage yet this cycle.
                </TableCell>
              </TableRow>
            ) : (
              pivot.map(r => (
                <TableRow key={`${r.owner}|${r.model}`}>
                  <TableCell>
                    <Link className='hover:underline' href={`/users/${encodeURIComponent(r.owner)}/cost`}>
                      {r.owner}
                    </Link>
                  </TableCell>
                  <TableCell>{r.model}</TableCell>
                  <TableCell className='text-right'>{r.inputTokens.toLocaleString()}</TableCell>
                  <TableCell className='text-right'>{r.outputTokens.toLocaleString()}</TableCell>
                  <TableCell className='text-right'>{fmtCents(r.cents)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          {pivot.length > 0 ? (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2}>Total</TableCell>
                <TableCell className='text-right'>
                  {pivot.reduce((s, r) => s + r.inputTokens, 0).toLocaleString()}
                </TableCell>
                <TableCell className='text-right'>
                  {pivot.reduce((s, r) => s + r.outputTokens, 0).toLocaleString()}
                </TableCell>
                <TableCell className='text-right'>{fmtCents(pivot.reduce((s, r) => s + r.cents, 0))}</TableCell>
              </TableRow>
            </TableFooter>
          ) : null}
        </Table>
      </section>
      <section className='space-y-3'>
        <div className='flex flex-wrap items-center gap-4'>
          <h2 className='font-semibold text-lg'>
            Gradebook{grade ? ` (${grade.users.length} × ${grade.topics.length})` : ''}
          </h2>
          <Button onClick={() => setGradeNonce(Date.now())} size='sm' variant='outline'>
            {gradeNonce === null ? 'Load' : 'Refresh'}
          </Button>
          <div className='ml-auto flex items-center gap-2'>
            <Switch
              checked={autoAssign === 'true'}
              disabled={autoBusy || autoAssign === undefined}
              id='auto-assign'
              onCheckedChange={next => {
                // oxlint-disable-next-line promise/prefer-await-to-then, promise/prefer-await-to-callbacks -- React handler
                toggleAuto(next).catch((error: unknown) => toast.error(String(error)))
              }}
            />
            <label className='text-sm' htmlFor='auto-assign'>
              Agent auto-assign
              <span className='block text-muted-foreground text-xs'>
                Daily 03:00 UTC cron fills every eligible (user, topic) cell
              </span>
            </label>
          </div>
        </div>
        <div className='flex flex-wrap gap-3 text-muted-foreground text-xs'>
          <span>
            <span className='font-mono text-foreground'>✓</span> passed
          </span>
          <span>
            <span className='font-mono text-foreground'>✗</span> admin-assigned, not passed
          </span>
          <span>
            <span className='font-mono text-foreground'>ⓐ</span> agent-assigned, not passed
          </span>
          <span>
            <span className='font-mono text-foreground'>·</span> not assigned
          </span>
        </div>
        {grade ? (
          grade.topics.length === 0 ? (
            <div className='text-muted-foreground'>No topics with pool ≥ 5 yet.</div>
          ) : (
            <div className='overflow-auto'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <Checkbox
                        aria-label='Select all users'
                        checked={grade.users.length > 0 && grade.users.every(u => selectedUsers.has(u.userId))}
                        onCheckedChange={() =>
                          setSelectedUsers(prev =>
                            grade.users.every(u => prev.has(u.userId))
                              ? new Set()
                              : new Set(grade.users.map(u => u.userId))
                          )
                        }
                      />
                    </TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Dept</TableHead>
                    {grade.topics.map(t => (
                      <TableHead className='text-center' key={t._id}>
                        <div className='flex flex-col items-center gap-1'>
                          <span className='max-w-[10rem] truncate' title={t.name}>
                            {t.name}
                          </span>
                          <div className='flex items-center gap-1'>
                            <Badge variant='secondary'>{t.poolSize} Q</Badge>
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                render={<Button aria-label={`Actions for ${t.name}`} size='icon-sm' variant='ghost' />}>
                                ⋯
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align='end'>
                                <DropdownMenuItem
                                  onClick={() =>
                                    setPending({
                                      kind: 'assign',
                                      poolSize: t.poolSize,
                                      topicId: t._id,
                                      topicName: t.name
                                    })
                                  }>
                                  Assign to all
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={selectedUsers.size === 0}
                                  onClick={() =>
                                    setPending({
                                      kind: 'assignSelected',
                                      poolSize: t.poolSize,
                                      topicId: t._id,
                                      topicName: t.name,
                                      userIds: [...selectedUsers]
                                    })
                                  }>
                                  Assign to selected ({selectedUsers.size})
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() =>
                                    setPending({
                                      kind: 'unassign',
                                      poolSize: t.poolSize,
                                      topicId: t._id,
                                      topicName: t.name
                                    })
                                  }>
                                  Un-assign all
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() =>
                                    setPending({
                                      kind: 'rearm',
                                      poolSize: t.poolSize,
                                      topicId: t._id,
                                      topicName: t.name
                                    })
                                  }>
                                  Mark substantive (re-arm)
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grade.users.map(u => (
                    <TableRow key={u.userId}>
                      <TableCell>
                        <Checkbox
                          aria-label={`Select ${u.userId}`}
                          checked={selectedUsers.has(u.userId)}
                          onCheckedChange={() => toggleUser(u.userId)}
                        />
                      </TableCell>
                      <TableCell>{u.userId}</TableCell>
                      <TableCell className='text-muted-foreground'>{u.department ?? '—'}</TableCell>
                      {grade.topics.map(t => {
                        const cell = grade.cells.find(c => c.userId === u.userId && c.topicId === t._id)
                        return (
                          <TableCell className='text-center font-mono' key={t._id}>
                            <Link
                              className='hover:underline'
                              href={`/users/${encodeURIComponent(u.userId)}/topics/${t._id}`}>
                              {cell?.glyph ?? '·'}
                            </Link>
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={3}>Pass rate</TableCell>
                    {grade.topics.map(t => {
                      const f = grade.colFooters.find(c => c.topicId === t._id)
                      const rate = f && f.assigned > 0 ? Math.round((f.passedAssigned / f.assigned) * 100) : null
                      return (
                        <TableCell className='text-center' key={t._id}>
                          {rate === null ? '—' : `${rate}%`}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )
        ) : (
          <div className='text-muted-foreground'>{gradeNonce === null ? 'Click Load to fetch.' : 'Loading…'}</div>
        )}
      </section>
      <AlertDialog onOpenChange={open => !(open || running) && setPending(null)} open={pending !== null}>
        <AlertDialogContent>
          {pending ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{ACTION_COPY[pending.kind].title}</AlertDialogTitle>
                <AlertDialogDescription>
                  <span className='font-medium text-foreground'>{pending.topicName}</span> ({pending.poolSize} questions).{' '}
                  {ACTION_COPY[pending.kind].desc}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={running}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={running}
                  onClick={e => {
                    e.preventDefault()
                    // oxlint-disable-next-line promise/prefer-await-to-then, promise/prefer-await-to-callbacks -- React handler
                    runPending().catch((error: unknown) => toast.error(String(error)))
                  }}>
                  {running ? 'Working…' : ACTION_COPY[pending.kind].confirm}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : null}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
export default DashboardPage
