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
import { Button } from '@a/ui/components/button'
import { Checkbox } from '@a/ui/components/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@a/ui/components/dropdown-menu'
import { Input } from '@a/ui/components/input'
import { Switch } from '@a/ui/components/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@a/ui/components/table'
import { api } from 'backend/convex/_generated/api'
import { useAction, useMutation, useQuery } from 'convex/react'
import { Bot } from 'lucide-react'
import { Fragment, useId, useState } from 'react'
import { toast } from 'sonner'
const ACTIONS_TRIGGER = <Button aria-label='Topic actions' size='icon-sm' variant='ghost' />
type ActionKind = 'assign' | 'assignSelected' | 'rearm' | 'unassign'
interface PendingAction {
  kind: ActionKind
  topicId: string
  topicName: string
  userIds?: string[]
}
const ACTION_COPY: Record<ActionKind, { confirm: string; desc: string; title: string }> = {
  assign: {
    confirm: 'Assign to all',
    desc: 'Assigns this test to every user account. Anyone who already passed it or has a live assignment is skipped automatically.',
    title: 'Assign test to all users?'
  },
  assignSelected: {
    confirm: 'Assign to selected',
    desc: 'Assigns this test only to the users you checked. Anyone already passed or with a live assignment is skipped.',
    title: 'Assign test to selected users?'
  },
  rearm: {
    confirm: 'Mark substantive',
    desc: 'Marks the corpus change substantive: every assigned-pass earned before now is revoked and those users are re-assigned. Self-passes are untouched.',
    title: 'Mark substantive and re-arm?'
  },
  unassign: {
    confirm: 'Un-assign all',
    desc: 'Removes every assignment for this topic and cancels in-progress assigned attempts. Past pass records are kept. The agent may refill if auto-assign is on.',
    title: 'Un-assign all users?'
  }
}
const relTime = (ms: number): string => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  return `${Math.round(h / 24)} d ago`
}
const Card = ({ children, title }: { children: React.ReactNode; title: string }): React.ReactElement => (
  <div className='rounded-lg border bg-card p-4'>
    <div className='mb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wide'>{title}</div>
    {children}
  </div>
)
const TrainingPage = (): React.ReactElement => {
  const summary = useQuery(api.dashboard.trainingSummary, {})
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const roster = useQuery(api.dashboard.trainingUsers, { page, search })
  const autoAssign = useQuery(api.settings.getForAdmin, { key: 'agent_auto_assign_enabled' })
  const activity = useQuery(api.dashboard.agentActivity, {})
  const dueSetting = useQuery(api.settings.getForAdmin, { key: 'assignment_due_days' })
  const setSetting = useMutation(api.settings.setForAdmin)
  const assignAll = useMutation(api.trainingAssignments.assignAllForTopic)
  const assignUsers = useMutation(api.trainingAssignments.assignUsersForTopic)
  const unassignAll = useMutation(api.trainingAssignments.unassignAllForTopic)
  const rearm = useMutation(api.training.markTopicSubstantive)
  const assignNow = useAction(api.training.assignEligibleNow)
  const [pending, setPending] = useState<null | PendingAction>(null)
  const [running, setRunning] = useState(false)
  const [autoBusy, setAutoBusy] = useState(false)
  const [assignNowBusy, setAssignNowBusy] = useState(false)
  const [dueDraft, setDueDraft] = useState<null | string>(null)
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(() => new Set())
  const [expanded, setExpanded] = useState<null | string>(null)
  const [agentOpen, setAgentOpen] = useState(false)
  const switchId = useId()
  const dueId = useId()
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
      toast.success(`Auto-assign ${next ? 'on' : 'off'}`)
    } catch (error: unknown) {
      toast.error(String(error))
    } finally {
      setAutoBusy(false)
    }
  }
  const saveDue = async (): Promise<void> => {
    if (dueDraft === null) return
    const n = Number.parseInt(dueDraft, 10)
    if (!Number.isFinite(n) || n <= 0) {
      toast.error('Enter a positive number of days')
      setDueDraft(null)
      return
    }
    try {
      await setSetting({ key: 'assignment_due_days', value: String(n) })
      toast.success(`Overdue after ${n} days`)
    } catch (error: unknown) {
      toast.error(String(error))
    } finally {
      setDueDraft(null)
    }
  }
  const runAssignNow = async (): Promise<void> => {
    setAssignNowBusy(true)
    try {
      const r = await assignNow()
      toast.success(`Agent assigned ${r.assignmentsCreated} new across ${r.topicsProcessed} topics`)
    } catch (error: unknown) {
      toast.error(String(error))
    } finally {
      setAssignNowBusy(false)
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
  if (summary === null) return <div className='p-6 text-destructive'>Admin role required.</div>
  if (summary === undefined) return <div className='p-6'>Loading…</div>
  const dueDays = dueSetting ?? '14'
  const latestEvent = activity?.events[0]
  const agentLine =
    autoAssign === 'true'
      ? latestEvent
        ? `· last assigned ${latestEvent.assignmentsCreated} test${latestEvent.assignmentsCreated === 1 ? '' : 's'} ${relTime(latestEvent.at)}`
        : activity?.lastCheck
          ? `· running · everyone eligible already assigned (checked ${relTime(activity.lastCheck)})`
          : '· running'
      : '· assignments are manual only'
  return (
    <div className='space-y-6 p-6'>
      <div className='flex flex-wrap items-center gap-4'>
        <h1 className='font-semibold text-xl'>Training</h1>
        <div className='ml-auto flex flex-wrap items-center gap-4'>
          <div className='flex items-center gap-2 text-sm'>
            <label htmlFor={dueId}>Overdue after</label>
            <Input
              className='h-8 w-16'
              id={dueId}
              inputMode='numeric'
              onBlur={() => {
                // oxlint-disable-next-line promise/prefer-await-to-then, promise/prefer-await-to-callbacks -- React handler
                saveDue().catch((error: unknown) => toast.error(String(error)))
              }}
              onChange={e => setDueDraft(e.target.value)}
              value={dueDraft ?? dueDays}
            />
            <span className='text-muted-foreground'>days</span>
          </div>
          <div className='flex items-center gap-2 text-sm'>
            <Switch
              checked={autoAssign === 'true'}
              disabled={autoBusy || autoAssign === undefined}
              id={switchId}
              onCheckedChange={next => {
                // oxlint-disable-next-line promise/prefer-await-to-then, promise/prefer-await-to-callbacks -- React handler
                toggleAuto(next).catch((error: unknown) => toast.error(String(error)))
              }}
            />
            <label htmlFor={switchId}>Agent auto-assign</label>
          </div>
          <Button
            disabled={assignNowBusy}
            onClick={() => {
              // oxlint-disable-next-line promise/prefer-await-to-then, promise/prefer-await-to-callbacks -- React handler
              runAssignNow().catch((error: unknown) => toast.error(String(error)))
            }}
            size='sm'
            variant='outline'>
            {assignNowBusy ? 'Assigning…' : 'Assign eligible now'}
          </Button>
        </div>
      </div>
      <div
        className={cn(
          'rounded-md border px-3 py-2 text-sm',
          autoAssign === 'true' ? 'border-primary/40 bg-primary/5' : 'bg-muted/40'
        )}>
        <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
          <Bot
            aria-hidden
            className={cn('size-4 shrink-0', autoAssign === 'true' ? 'text-primary' : 'text-muted-foreground')}
          />
          <span className='font-medium'>{autoAssign === 'true' ? 'Agent on' : 'Agent auto-assign off'}</span>
          <span className='text-muted-foreground'>{agentLine}</span>
          <button
            className='ml-auto text-muted-foreground text-xs hover:underline'
            onClick={() => setAgentOpen(o => !o)}
            type='button'>
            {agentOpen ? 'Hide details ▴' : 'Details ▾'}
          </button>
        </div>
        {agentOpen ? (
          <div className='mt-2 border-t pt-2 text-muted-foreground'>
            <p>When on, the agent works continuously on its own — no schedule to set. It:</p>
            <ul className='mt-1 list-disc space-y-0.5 pl-5'>
              <li>assigns every eligible test to every employee automatically</li>
              <li>catches new hires and assigns them within minutes of joining</li>
              <li>assigns a test the moment it reaches enough questions to go live</li>
              <li>re-fills anything accidentally un-assigned, so nobody slips through</li>
            </ul>
            <div className='mt-2 font-medium text-foreground'>Recent activity</div>
            {activity && activity.events.length > 0 ? (
              <ul className='mt-1 space-y-1'>
                {activity.events.map(e => (
                  <li key={`${e.at}-${e.mode}`}>
                    <span className='text-foreground'>{relTime(e.at)}</span> — agent assigned{' '}
                    <span className='font-medium text-foreground'>{e.assignmentsCreated}</span> test
                    {e.assignmentsCreated === 1 ? '' : 's'} across {e.topicsProcessed} topic
                    {e.topicsProcessed === 1 ? '' : 's'}
                  </li>
                ))}
              </ul>
            ) : (
              <p className='mt-1'>
                No assignments created yet — everyone eligible is already assigned, or auto-assign is off.
              </p>
            )}
          </div>
        ) : null}
      </div>
      <section className='grid gap-3 md:grid-cols-4'>
        <Card title='Overview'>
          <div className='font-bold text-3xl'>{summary.totalUsers}</div>
          <div className='mt-1 text-muted-foreground text-sm'>users</div>
          <div className='mt-3 space-y-1 text-sm'>
            <div>
              <span className='font-semibold'>{summary.usersFullyCompliantPct}%</span> passed all assigned
            </div>
            <div>
              <span className='font-semibold'>{summary.overallPassRate}%</span> overall pass rate
            </div>
          </div>
        </Card>
        <Card title='Overdue tests'>
          <div className={cn('font-bold text-3xl', summary.totalOverdue > 0 && 'text-yellow-700 dark:text-yellow-400')}>
            {summary.totalOverdue}
          </div>
          <div className='mt-3 space-y-1 text-sm'>
            {summary.overdueOffenders.length === 0 ? (
              <div className='text-muted-foreground'>Nobody overdue</div>
            ) : (
              summary.overdueOffenders.map(o => (
                <div className='flex justify-between gap-2' key={o.userId}>
                  <span className='truncate'>{o.userId}</span>
                  <span className='font-semibold tabular-nums'>{o.overdue}</span>
                </div>
              ))
            )}
          </div>
        </Card>
        <Card title='People at risk'>
          {summary.atRisk.length === 0 ? (
            <div className='text-muted-foreground text-sm'>Everyone on track</div>
          ) : (
            <div className='space-y-1 text-sm'>
              {summary.atRisk.map(u => (
                <div className='flex justify-between gap-2' key={u.userId}>
                  <span className='truncate'>{u.userId}</span>
                  <span className='text-muted-foreground tabular-nums'>
                    {u.passed}/{u.assigned}
                    {u.overdue > 0 ? (
                      <span className='ml-1 text-yellow-700 dark:text-yellow-400'>⏰{u.overdue}</span>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title='Weakest test'>
          {summary.weakestTest ? (
            <>
              <div className='truncate font-semibold' title={summary.weakestTest.name}>
                {summary.weakestTest.name}
              </div>
              <div className='mt-2 font-bold text-3xl'>{summary.weakestTest.passRate}%</div>
              <div className='text-muted-foreground text-sm'>pass rate</div>
            </>
          ) : (
            <div className='text-muted-foreground text-sm'>No assigned tests yet</div>
          )}
        </Card>
      </section>
      <section className='space-y-2'>
        <h2 className='font-semibold text-lg'>Tests</h2>
        {summary.tests.length === 0 ? (
          <div className='text-muted-foreground'>No topics with pool ≥ 5 yet.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Test</TableHead>
                <TableHead className='text-right'>Pool</TableHead>
                <TableHead className='text-right'>Assigned</TableHead>
                <TableHead className='text-right'>Pass rate</TableHead>
                <TableHead className='text-right'>Overdue</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.tests.map(t => (
                <TableRow key={t.topicId}>
                  <TableCell className='font-medium'>{t.name}</TableCell>
                  <TableCell className='text-right tabular-nums'>{t.poolSize}</TableCell>
                  <TableCell className='text-right tabular-nums'>{t.assigned}</TableCell>
                  <TableCell className='text-right tabular-nums'>
                    {t.assigned === 0 ? '—' : `${Math.round((t.passed / t.assigned) * 100)}%`}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right tabular-nums',
                      t.overdue > 0 && 'font-semibold text-yellow-700 dark:text-yellow-400'
                    )}>
                    {t.overdue}
                  </TableCell>
                  <TableCell className='text-right'>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={ACTIONS_TRIGGER}>⋯</DropdownMenuTrigger>
                      <DropdownMenuContent align='end'>
                        <DropdownMenuItem
                          onClick={() => setPending({ kind: 'assign', topicId: t.topicId, topicName: t.name })}>
                          Assign to all
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={selectedUsers.size === 0}
                          onClick={() =>
                            setPending({
                              kind: 'assignSelected',
                              topicId: t.topicId,
                              topicName: t.name,
                              userIds: [...selectedUsers]
                            })
                          }>
                          Assign to selected ({selectedUsers.size})
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setPending({ kind: 'unassign', topicId: t.topicId, topicName: t.name })}>
                          Un-assign all
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setPending({ kind: 'rearm', topicId: t.topicId, topicName: t.name })}>
                          Mark substantive (re-arm)
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
      <section className='space-y-2'>
        <div className='flex flex-wrap items-center gap-3'>
          <h2 className='font-semibold text-lg'>Users</h2>
          <Input
            className='h-8 w-64'
            onChange={e => {
              setSearch(e.target.value)
              setPage(0)
            }}
            placeholder='Search username…'
            value={search}
          />
          {selectedUsers.size > 0 ? (
            <span className='text-muted-foreground text-sm'>{selectedUsers.size} selected</span>
          ) : null}
        </div>
        {roster === undefined ? (
          <div className='text-muted-foreground'>Loading…</div>
        ) : roster === null || roster.rows.length === 0 ? (
          <div className='text-muted-foreground'>No matching users.</div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className='w-8' />
                  <TableHead>User</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead className='text-right'>Passed / assigned</TableHead>
                  <TableHead className='text-right'>Overdue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roster.rows.map(u => {
                  const isOpen = expanded === u.userId
                  return (
                    <Fragment key={u.userId}>
                      <TableRow>
                        <TableCell>
                          <Checkbox
                            aria-label={`Select ${u.userId}`}
                            checked={selectedUsers.has(u.userId)}
                            onCheckedChange={() => toggleUser(u.userId)}
                          />
                        </TableCell>
                        <TableCell className='font-medium'>
                          <button
                            className='flex items-center gap-1 text-left hover:underline'
                            onClick={() => setExpanded(isOpen ? null : u.userId)}
                            type='button'>
                            <span className='text-muted-foreground text-xs'>{isOpen ? '▾' : '▸'}</span>
                            {u.userId}
                          </button>
                        </TableCell>
                        <TableCell className='text-muted-foreground'>{u.department ?? 'Unassigned'}</TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {u.passed}/{u.assigned}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right tabular-nums',
                            u.overdue > 0 && 'font-semibold text-yellow-700 dark:text-yellow-400'
                          )}>
                          {u.overdue}
                        </TableCell>
                      </TableRow>
                      {isOpen ? (
                        <TableRow>
                          <TableCell />
                          <TableCell className='py-3' colSpan={4}>
                            {u.details.length === 0 ? (
                              <span className='text-muted-foreground text-sm'>No tests assigned.</span>
                            ) : (
                              <ul className='space-y-1 text-sm'>
                                {u.details.map(d => (
                                  <li className='flex items-center gap-2' key={d.name}>
                                    {d.status === 'passed' ? (
                                      <span className='text-green-600'>✓</span>
                                    ) : d.status === 'overdue' ? (
                                      <span className='text-yellow-700 dark:text-yellow-400'>⏰</span>
                                    ) : (
                                      <span className='text-muted-foreground'>●</span>
                                    )}
                                    <span>{d.name}</span>
                                    <span className='text-muted-foreground'>
                                      {d.status === 'passed'
                                        ? '— passed'
                                        : d.status === 'overdue'
                                          ? `— overdue (${d.overdueDays} ${d.overdueDays === 1 ? 'day' : 'days'})`
                                          : '— not passed'}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>
            <div className='flex items-center justify-between text-muted-foreground text-sm'>
              <span>{roster.total} users</span>
              <div className='flex items-center gap-2'>
                <Button disabled={page === 0} onClick={() => setPage(p => p - 1)} size='sm' variant='outline'>
                  Prev
                </Button>
                <span>
                  {page + 1} / {roster.pageCount}
                </span>
                <Button
                  disabled={page + 1 >= roster.pageCount}
                  onClick={() => setPage(p => p + 1)}
                  size='sm'
                  variant='outline'>
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </section>
      <AlertDialog onOpenChange={open => !(open || running) && setPending(null)} open={pending !== null}>
        <AlertDialogContent>
          {pending ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{ACTION_COPY[pending.kind].title}</AlertDialogTitle>
                <AlertDialogDescription>
                  <span className='font-medium text-foreground'>{pending.topicName}</span>.{' '}
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
export default TrainingPage
