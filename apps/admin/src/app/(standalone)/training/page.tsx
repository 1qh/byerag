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
import { Bot } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { toast } from 'sonner'
const ACTIONS_TRIGGER = <Button aria-label='Topic actions' size='icon-sm' variant='ghost' />
const DEPARTMENTS = ['HR', 'Sales', 'IT', 'Unassigned'] as const
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
  const autoAssign = useQuery(api.settings.getForAdmin, { key: 'agent_auto_assign_enabled' })
  const dueSetting = useQuery(api.settings.getForAdmin, { key: 'assignment_due_days' })
  const setSetting = useMutation(api.settings.setForAdmin)
  const unassignAll = useMutation(api.trainingAssignments.unassignAllForTopic)
  const rearm = useMutation(api.training.markTopicSubstantive)
  const assignNow = useAction(api.training.assignEligibleNow)
  const assignComposer = useMutation(api.training.assignComposer)
  const [aSearch, setASearch] = useState('')
  const [aPage, setAPage] = useState(0)
  const [aDept, setADept] = useState('')
  const [aStatus, setAStatus] = useState<'' | 'open' | 'overdue' | 'passed' | 'unfinished'>('')
  const at = useQuery(api.dashboard.assignmentsTable, {
    department: aDept || undefined,
    page: aPage,
    search: aSearch,
    status: aStatus || undefined
  })
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
  const [cDept, setCDept] = useState<string>('HR')
  const [cDueDays, setCDueDays] = useState('')
  const [cBusy, setCBusy] = useState(false)
  const assignmentsRef = useRef<HTMLElement>(null)
  const switchId = useId()
  const dueId = useId()
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
  const TESTS_PER_PAGE = 10
  const tFiltered = summary.tests.filter(t => t.name.toLowerCase().includes(tSearch.trim().toLowerCase()))
  const tPageCount = Math.max(1, Math.ceil(tFiltered.length / TESTS_PER_PAGE))
  const tClamped = Math.min(tPage, tPageCount - 1)
  const pagedTests = tFiltered.slice(tClamped * TESTS_PER_PAGE, tClamped * TESTS_PER_PAGE + TESTS_PER_PAGE)
  const latest = at?.latest ?? null
  const agentLine =
    autoAssign === 'true'
      ? latest
        ? `· last assigned ${latest.test} to ${latest.userId} ${relTime(latest.at)}`
        : at?.lastCheck
          ? `· running · everyone eligible already assigned (checked ${relTime(at.lastCheck)})`
          : '· running'
      : '· assignments are manual only'
  const goAtRisk = (): void => {
    setAStatus('unfinished')
    setAPage(0)
    setASearch('')
    setADept('')
    assignmentsRef.current?.scrollIntoView({ behavior: 'smooth' })
  }
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
            onClick={() => {
              setCTopic(summary.tests[0]?.topicId ?? '')
              setCAudience('all')
              setCDueDays('')
              setComposerOpen(true)
            }}
            size='sm'>
            Assign a test
          </Button>
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
          'flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm',
          autoAssign === 'true' ? 'border-primary/40 bg-primary/5' : 'bg-muted/40'
        )}>
        <Bot
          aria-hidden
          className={cn('size-4 shrink-0', autoAssign === 'true' ? 'text-primary' : 'text-muted-foreground')}
        />
        <span className='font-medium'>{autoAssign === 'true' ? 'Agent on' : 'Agent auto-assign off'}</span>
        <span className='text-muted-foreground'>{agentLine}</span>
      </div>
      <section className='grid gap-3 md:grid-cols-3'>
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
      <section className='space-y-2' ref={assignmentsRef}>
        <div className='flex flex-wrap items-center gap-3'>
          <h2 className='font-semibold text-lg'>Assignments</h2>
          <Input
            className='h-8 w-56'
            onChange={e => {
              setASearch(e.target.value)
              setAPage(0)
            }}
            placeholder='Search user or test…'
            value={aSearch}
          />
          <NativeSelect
            aria-label='Filter by department'
            className='h-8 w-40'
            onChange={e => {
              setADept(e.target.value)
              setAPage(0)
            }}
            value={aDept}>
            <NativeSelectOption value=''>All departments</NativeSelectOption>
            {DEPARTMENTS.map(d => (
              <NativeSelectOption key={d} value={d}>
                {d}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label='Filter by status'
            className='h-8 w-44'
            onChange={e => {
              setAStatus(e.target.value as '' | 'open' | 'overdue' | 'passed' | 'unfinished')
              setAPage(0)
            }}
            value={aStatus}>
            <NativeSelectOption value=''>All statuses</NativeSelectOption>
            <NativeSelectOption value='unfinished'>Unfinished (not passed)</NativeSelectOption>
            <NativeSelectOption value='overdue'>Overdue</NativeSelectOption>
            <NativeSelectOption value='open'>Not passed (in time)</NativeSelectOption>
            <NativeSelectOption value='passed'>Passed</NativeSelectOption>
          </NativeSelect>
        </div>
        {at === undefined ? (
          <div className='text-muted-foreground'>Loading…</div>
        ) : at === null || at.rows.length === 0 ? (
          <div className='text-muted-foreground'>No assignments match.</div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Test</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assigned</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {at.rows.map(r => (
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
                    <TableCell className='text-muted-foreground'>
                      {new Date(r.at).toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh' })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
