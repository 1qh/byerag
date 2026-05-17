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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@a/ui/components/dialog'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@a/ui/components/dropdown-menu'
import { Input } from '@a/ui/components/input'
import { Label } from '@a/ui/components/label'
import { NativeSelect, NativeSelectOption } from '@a/ui/components/native-select'
import { Switch } from '@a/ui/components/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@a/ui/components/table'
import { api } from 'backend/convex/_generated/api'
import { useAction, useMutation, useQuery } from 'convex/react'
import { useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
const ACTIONS_TRIGGER = <Button aria-label='Topic actions' size='icon-sm' variant='ghost' />
const DEPARTMENTS = ['Safety, Health and Environment'] as const
const WEEKDAYS = [
  { l: 'Mon', v: '1' },
  { l: 'Tue', v: '2' },
  { l: 'Wed', v: '3' },
  { l: 'Thu', v: '4' },
  { l: 'Fri', v: '5' },
  { l: 'Sat', v: '6' },
  { l: 'Sun', v: '0' }
] as const
type ActionKind = 'rearm' | 'unassign'
interface PendingAction {
  kind: ActionKind
  topicId: string
  topicName: string
}
const ACTION_COPY: Record<ActionKind, { confirm: string; desc: string; title: string }> = {
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
const Card = ({ children, title }: { children: React.ReactNode; title: string }): React.ReactElement => (
  <div className='rounded-lg border bg-card p-4'>
    <div className='mb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wide'>{title}</div>
    {children}
  </div>
)
const FilterHeader = ({
  label,
  onChange,
  options,
  selected
}: {
  label: string
  onChange: (v: string[]) => void
  options: string[]
  selected: string[]
}): React.ReactElement => (
  <DropdownMenu>
    <DropdownMenuTrigger
      render={<Button className='-ml-2 h-auto gap-1 px-2 py-1 font-medium' size='sm' variant='ghost' />}>
      {label}
      {selected.length > 0 ? (
        <span className='rounded bg-primary/15 px-1 text-primary text-xs'>{selected.length}</span>
      ) : null}
      <span className='text-muted-foreground text-xs'>▾</span>
    </DropdownMenuTrigger>
    <DropdownMenuContent align='start' className='max-h-72 overflow-auto'>
      {options.length === 0 ? (
        <DropdownMenuItem disabled>No options</DropdownMenuItem>
      ) : (
        options.map(o => (
          <DropdownMenuCheckboxItem
            checked={selected.includes(o)}
            key={o}
            onCheckedChange={() => onChange(selected.includes(o) ? selected.filter(x => x !== o) : [...selected, o])}>
            {o}
          </DropdownMenuCheckboxItem>
        ))
      )}
      {selected.length > 0 ? (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onChange([])}>Clear</DropdownMenuItem>
        </>
      ) : null}
    </DropdownMenuContent>
  </DropdownMenu>
)
const TrainingPage = (): React.ReactElement => {
  const summary = useQuery(api.dashboard.trainingSummary, {})
  const autoAssign = useQuery(api.settings.getForAdmin, { key: 'agent_auto_assign_enabled' })
  const dueSetting = useQuery(api.settings.getForAdmin, { key: 'assignment_due_days' })
  const hourSetting = useQuery(api.settings.getForAdmin, { key: 'agent_auto_assign_hour' })
  const wdSetting = useQuery(api.settings.getForAdmin, { key: 'agent_auto_assign_weekdays' })
  const setSetting = useMutation(api.settings.setForAdmin)
  const unassignAll = useMutation(api.trainingAssignments.unassignAllForTopic)
  const rearm = useMutation(api.training.markTopicSubstantive)
  const assignNow = useAction(api.training.assignEligibleNow)
  const assignComposer = useMutation(api.training.assignComposer)
  const [aPage, setAPage] = useState(0)
  const [fDept, setFDept] = useState<string[]>([])
  const [fTest, setFTest] = useState<string[]>([])
  const [fStatus, setFStatus] = useState<string[]>([])
  const [fDeadline, setFDeadline] = useState<string[]>([])
  const [fAssigned, setFAssigned] = useState<string[]>([])
  const at = useQuery(api.dashboard.assignmentsTable, {
    assigneds: fAssigned,
    deadlines: fDeadline,
    departments: fDept,
    page: aPage,
    statuses: fStatus,
    tests: fTest
  })
  const [sSearch, setSSearch] = useState('')
  const [sPage, setSPage] = useState(0)
  const userSum = useQuery(api.dashboard.userSummary, { page: sPage, search: sSearch })
  const [tSearch, setTSearch] = useState('')
  const [tPage, setTPage] = useState(0)
  const [pending, setPending] = useState<null | PendingAction>(null)
  const [running, setRunning] = useState(false)
  const [autoBusy, setAutoBusy] = useState(false)
  const [assignNowBusy, setAssignNowBusy] = useState(false)
  const [dueDraft, setDueDraft] = useState<null | string>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [cTopic, setCTopic] = useState('')
  const [cAudience, setCAudience] = useState<'all' | 'department'>('all')
  const [cDept, setCDept] = useState<string>('Safety, Health and Environment')
  const [cDueDays, setCDueDays] = useState('')
  const [cBusy, setCBusy] = useState(false)
  const [agentOpen, setAgentOpen] = useState(false)
  const [hourDraft, setHourDraft] = useState<null | string>(null)
  const [wdDraft, setWdDraft] = useState<null | Set<string>>(null)
  const [schedBusy, setSchedBusy] = useState(false)
  const assignmentsRef = useRef<HTMLElement>(null)
  const summaryRef = useRef<HTMLElement>(null)
  const seenAtRef = useRef<null | number>(null)
  const switchId = useId()
  const dueId = useId()
  useEffect(() => {
    const l = at?.latest
    if (!l) return
    if (seenAtRef.current === null) {
      seenAtRef.current = l.at
      return
    }
    if (l.at > seenAtRef.current) {
      seenAtRef.current = l.at
      if (l.source === 'agent') toast.message(`Agent assigned ${l.test} to ${l.userId}`)
    }
  }, [at?.latest])
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
  const saveSchedule = async (hour: string, weekdays: Set<string>): Promise<void> => {
    setSchedBusy(true)
    try {
      await setSetting({ key: 'agent_auto_assign_hour', value: hour })
      await setSetting({ key: 'agent_auto_assign_weekdays', value: [...weekdays].join(',') })
      toast.success(hour === '' ? 'Agent runs continuously' : `Agent runs at ${hour}:00 VN`)
      setHourDraft(null)
      setWdDraft(null)
    } catch (error: unknown) {
      toast.error(String(error))
    } finally {
      setSchedBusy(false)
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
      if (pending.kind === 'unassign') {
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
  const runComposer = async (): Promise<void> => {
    if (!cTopic) {
      toast.error('Pick a test')
      return
    }
    setCBusy(true)
    try {
      const days = cDueDays.trim() ? Number.parseInt(cDueDays, 10) : Number.NaN
      const dueAtMs = Number.isFinite(days) && days > 0 ? Date.now() + days * 86_400_000 : undefined
      const r = await assignComposer({
        audience: cAudience,
        department: cAudience === 'department' ? cDept : undefined,
        dueAtMs,
        topicId: cTopic as never
      })
      toast.success(`Assigned ${r.assignmentsCreated} · ${r.skipped} skipped`)
      setComposerOpen(false)
    } catch (error: unknown) {
      toast.error(String(error))
    } finally {
      setCBusy(false)
    }
  }
  if (summary === null) return <div className='p-6 text-destructive'>Admin role required.</div>
  if (summary === undefined) return <div className='p-6'>Loading…</div>
  const dueDays = dueSetting ?? '14'
  const hourVal = hourDraft ?? hourSetting ?? ''
  const wdSet = wdDraft ?? new Set((wdSetting ?? '').split(',').filter(Boolean))
  const TESTS_PER_PAGE = 10
  const tFiltered = summary.tests.filter(t => t.name.toLowerCase().includes(tSearch.trim().toLowerCase()))
  const tPageCount = Math.max(1, Math.ceil(tFiltered.length / TESTS_PER_PAGE))
  const tClamped = Math.min(tPage, tPageCount - 1)
  const pagedTests = tFiltered.slice(tClamped * TESTS_PER_PAGE, tClamped * TESTS_PER_PAGE + TESTS_PER_PAGE)
  const resetFilters = (): void => {
    setFDept([])
    setFTest([])
    setFStatus([])
    setFDeadline([])
    setFAssigned([])
    setAPage(0)
  }
  const goAtRisk = (): void => {
    resetFilters()
    setFStatus(['Overdue', 'Not passed'])
    assignmentsRef.current?.scrollIntoView({ behavior: 'smooth' })
  }
  const goWeakest = (): void => {
    if (!summary.weakestTest) return
    resetFilters()
    setFTest([summary.weakestTest.name])
    assignmentsRef.current?.scrollIntoView({ behavior: 'smooth' })
  }
  return (
    <div className='space-y-6 p-6'>
      <div className='flex flex-wrap items-center gap-4'>
        <h1 className='font-semibold text-xl'>Training</h1>
        <div className='ml-auto flex flex-wrap items-center gap-3'>
          <Button
            onClick={() => {
              setCTopic(summary.tests[0]?.topicId ?? '')
              setCAudience('all')
              setCDueDays('')
              setComposerOpen(true)
            }}
            size='sm'>
            Assign a test
          </Button>
          <Button onClick={() => setAgentOpen(true)} size='sm' variant='outline'>
            Agent auto-assign{autoAssign === 'true' ? ' · on' : ' · off'}
          </Button>
        </div>
      </div>
      <section className='grid gap-3 md:grid-cols-3'>
        <Card title='Overview'>
          <button
            className='-m-1 w-full rounded p-1 text-left hover:bg-muted'
            onClick={() => summaryRef.current?.scrollIntoView({ behavior: 'smooth' })}
            type='button'>
            <div className='font-bold text-3xl'>{summary.totalUsers}</div>
            <div className='mt-1 text-muted-foreground text-sm'>users — view summary</div>
            <div className='mt-3 space-y-1 text-sm'>
              <div>
                <span className='font-semibold'>{summary.usersFullyCompliantPct}%</span> passed all assigned
              </div>
              <div>
                <span className='font-semibold'>{summary.overallPassRate}%</span> overall pass rate
              </div>
            </div>
          </button>
        </Card>
        <Card title='People at risk'>
          <button
            className='-m-1 w-full rounded p-1 text-left hover:bg-muted disabled:cursor-default disabled:hover:bg-transparent'
            disabled={summary.atRiskCount === 0}
            onClick={goAtRisk}
            type='button'>
            <div className={cn('font-bold text-3xl', summary.atRiskCount > 0 && 'text-yellow-700 dark:text-yellow-400')}>
              {summary.atRiskCount}
            </div>
            <div className='mt-1 text-muted-foreground text-sm'>
              {summary.atRiskCount === 0 ? 'everyone on track' : 'have unfinished or overdue tests — view who'}
            </div>
          </button>
        </Card>
        <Card title='Weakest test'>
          {summary.weakestTest ? (
            <button className='-m-1 w-full rounded p-1 text-left hover:bg-muted' onClick={goWeakest} type='button'>
              <div className='truncate font-semibold' title={summary.weakestTest.name}>
                {summary.weakestTest.name}
              </div>
              <div className='mt-2 font-bold text-3xl'>{summary.weakestTest.passRate}%</div>
              <div className='text-muted-foreground text-sm'>pass rate — view assignments</div>
            </button>
          ) : (
            <div className='text-muted-foreground text-sm'>No assigned tests yet</div>
          )}
        </Card>
      </section>
      <section className='space-y-2'>
        <div className='flex flex-wrap items-center gap-3'>
          <h2 className='font-semibold text-lg'>Tests</h2>
          <Input
            className='h-8 w-64'
            onChange={e => {
              setTSearch(e.target.value)
              setTPage(0)
            }}
            placeholder='Search test name…'
            value={tSearch}
          />
        </div>
        {summary.tests.length === 0 ? (
          <div className='text-muted-foreground'>No topics with pool ≥ 5 yet.</div>
        ) : tFiltered.length === 0 ? (
          <div className='text-muted-foreground'>No tests match that name.</div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Test</TableHead>
                  <TableHead className='text-right'>Questions</TableHead>
                  <TableHead className='text-right'>Assigned</TableHead>
                  <TableHead className='text-right'>Pass rate</TableHead>
                  <TableHead className='text-right'>Overdue</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedTests.map(t => (
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
            {tPageCount > 1 ? (
              <div className='flex items-center justify-between text-muted-foreground text-sm'>
                <span>{tFiltered.length} tests</span>
                <div className='flex items-center gap-2'>
                  <Button disabled={tClamped === 0} onClick={() => setTPage(p => p - 1)} size='sm' variant='outline'>
                    Prev
                  </Button>
                  <span>
                    {tClamped + 1} / {tPageCount}
                  </span>
                  <Button
                    disabled={tClamped + 1 >= tPageCount}
                    onClick={() => setTPage(p => p + 1)}
                    size='sm'
                    variant='outline'>
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>
      <section className='space-y-2' ref={summaryRef}>
        <div className='flex flex-wrap items-center gap-3'>
          <h2 className='font-semibold text-lg'>User summary</h2>
          <Input
            className='h-8 w-56'
            onChange={e => {
              setSSearch(e.target.value)
              setSPage(0)
            }}
            placeholder='Search user…'
            value={sSearch}
          />
        </div>
        {userSum === undefined ? (
          <div className='text-muted-foreground'>Loading…</div>
        ) : userSum === null || userSum.rows.length === 0 ? (
          <div className='text-muted-foreground'>No users match.</div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead className='text-right'>Passed / assigned</TableHead>
                  <TableHead className='text-right'>Overdue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {userSum.rows.map(u => (
                  <TableRow key={u.userId}>
                    <TableCell className='font-medium'>{u.userId}</TableCell>
                    <TableCell className='text-muted-foreground'>{u.department}</TableCell>
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
                ))}
              </TableBody>
            </Table>
            <div className='flex items-center justify-between text-muted-foreground text-sm'>
              <span>{userSum.total} users</span>
              <div className='flex items-center gap-2'>
                <Button disabled={sPage === 0} onClick={() => setSPage(p => p - 1)} size='sm' variant='outline'>
                  Prev
                </Button>
                <span>
                  {sPage + 1} / {userSum.pageCount}
                </span>
                <Button
                  disabled={sPage + 1 >= userSum.pageCount}
                  onClick={() => setSPage(p => p + 1)}
                  size='sm'
                  variant='outline'>
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </section>
      <section className='space-y-2' ref={assignmentsRef}>
        <h2 className='font-semibold text-lg'>Assignments</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>
                <FilterHeader
                  label='Department'
                  onChange={v => {
                    setFDept(v)
                    setAPage(0)
                  }}
                  options={at?.facets.departments ?? []}
                  selected={fDept}
                />
              </TableHead>
              <TableHead>
                <FilterHeader
                  label='Test'
                  onChange={v => {
                    setFTest(v)
                    setAPage(0)
                  }}
                  options={at?.facets.tests ?? []}
                  selected={fTest}
                />
              </TableHead>
              <TableHead>
                <FilterHeader
                  label='Status'
                  onChange={v => {
                    setFStatus(v)
                    setAPage(0)
                  }}
                  options={at?.facets.statuses ?? []}
                  selected={fStatus}
                />
              </TableHead>
              <TableHead>
                <FilterHeader
                  label='Deadline'
                  onChange={v => {
                    setFDeadline(v)
                    setAPage(0)
                  }}
                  options={at?.facets.deadlines ?? []}
                  selected={fDeadline}
                />
              </TableHead>
              <TableHead>
                <FilterHeader
                  label='Assigned'
                  onChange={v => {
                    setFAssigned(v)
                    setAPage(0)
                  }}
                  options={at?.facets.assigneds ?? []}
                  selected={fAssigned}
                />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {at === undefined ? (
              <TableRow>
                <TableCell className='text-muted-foreground' colSpan={6}>
                  Loading…
                </TableCell>
              </TableRow>
            ) : at === null || at.rows.length === 0 ? (
              <TableRow>
                <TableCell className='text-muted-foreground' colSpan={6}>
                  No assignments match.
                </TableCell>
              </TableRow>
            ) : (
              at.rows.map(r => (
                <TableRow key={`${r.userId}-${r.test}-${r.at}`}>
                  <TableCell className='font-medium'>{r.userId}</TableCell>
                  <TableCell className='text-muted-foreground'>{r.department}</TableCell>
                  <TableCell>{r.test}</TableCell>
                  <TableCell>
                    {r.status === 'passed' ? (
                      <span className='text-green-600'>✓ Passed</span>
                    ) : r.status === 'overdue' ? (
                      <span className='font-medium text-yellow-700 dark:text-yellow-400'>
                        ⏰ Overdue {r.overdueDays} {r.overdueDays === 1 ? 'day' : 'days'}
                      </span>
                    ) : (
                      <span className='text-muted-foreground'>Not passed</span>
                    )}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-muted-foreground tabular-nums',
                      r.status === 'overdue' && 'font-medium text-yellow-700 dark:text-yellow-400'
                    )}>
                    {r.deadline}
                  </TableCell>
                  <TableCell className='text-muted-foreground tabular-nums'>{r.assigned}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {at && at.rows.length > 0 ? (
          <div className='flex items-center justify-between text-muted-foreground text-sm'>
            <span>{at.total} assignments</span>
            <div className='flex items-center gap-2'>
              <Button disabled={aPage === 0} onClick={() => setAPage(p => p - 1)} size='sm' variant='outline'>
                Prev
              </Button>
              <span>
                {aPage + 1} / {at.pageCount}
              </span>
              <Button
                disabled={aPage + 1 >= at.pageCount}
                onClick={() => setAPage(p => p + 1)}
                size='sm'
                variant='outline'>
                Next
              </Button>
            </div>
          </div>
        ) : null}
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
      <Dialog onOpenChange={setAgentOpen} open={agentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agent auto-assign</DialogTitle>
            <DialogDescription>
              When on, the agent assigns every eligible test to every user automatically. Pick when it should run and how
              long until a test is overdue.
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-4'>
            <div className='flex items-center gap-2'>
              <Switch
                checked={autoAssign === 'true'}
                disabled={autoBusy || autoAssign === undefined}
                id={switchId}
                onCheckedChange={next => {
                  // oxlint-disable-next-line promise/prefer-await-to-then, promise/prefer-await-to-callbacks -- React handler
                  toggleAuto(next).catch((error: unknown) => toast.error(String(error)))
                }}
              />
              <Label htmlFor={switchId}>Agent auto-assign {autoAssign === 'true' ? 'on' : 'off'}</Label>
            </div>
            <div className='space-y-1'>
              <Label htmlFor={dueId}>Overdue after (days)</Label>
              <Input
                className='w-24'
                id={dueId}
                inputMode='numeric'
                onBlur={() => {
                  // oxlint-disable-next-line promise/prefer-await-to-then, promise/prefer-await-to-callbacks -- React handler
                  saveDue().catch((error: unknown) => toast.error(String(error)))
                }}
                onChange={e => setDueDraft(e.target.value)}
                value={dueDraft ?? dueDays}
              />
            </div>
            <div className='space-y-1'>
              <Label htmlFor='a-hour'>Assign at (Vietnam time)</Label>
              <NativeSelect className='w-44' id='a-hour' onChange={e => setHourDraft(e.target.value)} value={hourVal}>
                <NativeSelectOption value=''>Continuously (every few min)</NativeSelectOption>
                {Array.from({ length: 24 }, (_, h) => (
                  <NativeSelectOption key={h} value={String(h)}>
                    {String(h).padStart(2, '0')}:00
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            {hourVal === '' ? null : (
              <div className='space-y-1'>
                <Label>On weekdays (none = every day)</Label>
                <div className='flex flex-wrap gap-1'>
                  {WEEKDAYS.map(d => {
                    const on = wdSet.has(d.v)
                    return (
                      <Button
                        key={d.v}
                        onClick={() => {
                          const n = new Set(wdSet)
                          if (on) n.delete(d.v)
                          else n.add(d.v)
                          setWdDraft(n)
                        }}
                        size='sm'
                        variant={on ? 'default' : 'outline'}>
                        {d.l}
                      </Button>
                    )
                  })}
                </div>
              </div>
            )}
            <Button
              disabled={assignNowBusy}
              onClick={() => {
                // oxlint-disable-next-line promise/prefer-await-to-then, promise/prefer-await-to-callbacks -- React handler
                runAssignNow().catch((error: unknown) => toast.error(String(error)))
              }}
              variant='secondary'>
              {assignNowBusy ? 'Assigning…' : 'Assign eligible now'}
            </Button>
          </div>
          <DialogFooter>
            <Button disabled={schedBusy} onClick={() => setAgentOpen(false)} variant='outline'>
              Close
            </Button>
            <Button
              disabled={schedBusy}
              onClick={() => {
                // oxlint-disable-next-line promise/prefer-await-to-then, promise/prefer-await-to-callbacks -- React handler
                saveSchedule(hourVal, wdSet).catch((error: unknown) => toast.error(String(error)))
              }}>
              {schedBusy ? 'Saving…' : 'Save schedule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog onOpenChange={setComposerOpen} open={composerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign a test</DialogTitle>
            <DialogDescription>
              Pick a test and who gets it. People who already passed it or have a live assignment are skipped
              automatically.
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-3'>
            <div className='space-y-1'>
              <Label htmlFor='c-topic'>Test</Label>
              <NativeSelect id='c-topic' onChange={e => setCTopic(e.target.value)} value={cTopic}>
                {summary.tests.length === 0 ? (
                  <NativeSelectOption value=''>No tests with enough questions yet</NativeSelectOption>
                ) : (
                  summary.tests.map(t => (
                    <NativeSelectOption key={t.topicId} value={t.topicId}>
                      {t.name} ({t.poolSize} questions)
                    </NativeSelectOption>
                  ))
                )}
              </NativeSelect>
            </div>
            <div className='space-y-1'>
              <Label htmlFor='c-audience'>Who</Label>
              <NativeSelect
                id='c-audience'
                onChange={e => setCAudience(e.target.value as 'all' | 'department')}
                value={cAudience}>
                <NativeSelectOption value='all'>Everyone</NativeSelectOption>
                <NativeSelectOption value='department'>A department</NativeSelectOption>
              </NativeSelect>
            </div>
            {cAudience === 'department' ? (
              <div className='space-y-1'>
                <Label htmlFor='c-dept'>Department</Label>
                <NativeSelect id='c-dept' onChange={e => setCDept(e.target.value)} value={cDept}>
                  {DEPARTMENTS.map(d => (
                    <NativeSelectOption key={d} value={d}>
                      {d}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            ) : null}
            <div className='space-y-1'>
              <Label htmlFor='c-due'>Overdue after (days)</Label>
              <Input
                className='w-32'
                id='c-due'
                inputMode='numeric'
                onChange={e => setCDueDays(e.target.value)}
                placeholder={`default ${dueDays}`}
                value={cDueDays}
              />
              <p className='text-muted-foreground text-xs'>Leave blank to use the standard {dueDays}-day window.</p>
            </div>
          </div>
          <DialogFooter>
            <Button disabled={cBusy} onClick={() => setComposerOpen(false)} variant='outline'>
              Cancel
            </Button>
            <Button
              disabled={cBusy || !cTopic}
              onClick={() => {
                // oxlint-disable-next-line promise/prefer-await-to-then, promise/prefer-await-to-callbacks -- React handler
                runComposer().catch((error: unknown) => toast.error(String(error)))
              }}>
              {cBusy ? 'Assigning…' : 'Assign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
export default TrainingPage
