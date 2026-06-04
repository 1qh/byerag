/* eslint-disable complexity */
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
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useId, useRef, useState } from 'react'
import { toast } from 'sonner'

const VN_DIACRITIC_RE = /[̀-ͯ]/gu
const NON_SLUG_RE = /[^a-z0-9]+/gu
const TRIM_HYPHEN_RE = /^-+|-+$/gu
const slugify = (s: string): string =>
  s
    .normalize('NFD')
    .replaceAll(VN_DIACRITIC_RE, '')
    .replaceAll('đ', 'd')
    .replaceAll('Đ', 'D')
    .toLowerCase()
    .replaceAll(NON_SLUG_RE, '-')
    .replaceAll(TRIM_HYPHEN_RE, '')
const ACTIONS_TRIGGER = <Button aria-label='Topic actions' size='icon-sm' variant='ghost' />
const DEPARTMENTS = ['Safety, Health and Environment'] as const
const HOURS = Array.from({ length: 24 }, (_, h) => String(h))
const WEEKDAYS = [
  { l: 'Mon', v: '1' },
  { l: 'Tue', v: '2' },
  { l: 'Wed', v: '3' },
  { l: 'Thu', v: '4' },
  { l: 'Fri', v: '5' },
  { l: 'Sat', v: '6' },
  { l: 'Sun', v: '0' }
] as const
const relTime = (ms: number): string => {
  const d = Date.now() - ms
  if (d < 60_000) return 'just now'
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`
  return `${Math.floor(d / 86_400_000)}d ago`
}
const pad2 = (n: number): string => String(n).padStart(2, '0')
const fmtVN = (ms: number): string => {
  const v = new Date(ms + 7 * 3_600_000)
  return `${v.getUTCFullYear()}-${pad2(v.getUTCMonth() + 1)}-${pad2(v.getUTCDate())} ${pad2(v.getUTCHours())}:${pad2(v.getUTCMinutes())} VN`
}
const nextRunMs = (hourStr: string, weekdays: Set<string>): null | number => {
  if (hourStr === '') return null
  const hour = Number(hourStr)
  if (!Number.isFinite(hour)) return null
  for (let i = 0; i < 14; i += 1) {
    const probe = new Date(Date.now() + 7 * 3_600_000 + i * 86_400_000)
    probe.setUTCHours(hour, 0, 0, 0)
    const realMs = probe.getTime() - 7 * 3_600_000
    if (realMs > Date.now() && (weekdays.size === 0 || weekdays.has(String(probe.getUTCDay())))) return realMs
  }
  return null
}
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
const AgentStatusBadge = ({
  autoAssign,
  hourSetting,
  lastRunSetting,
  wdSetting
}: {
  autoAssign: null | string | undefined
  hourSetting: null | string | undefined
  lastRunSetting: null | string | undefined
  wdSetting: null | string | undefined
}): React.ReactElement => {
  const on = autoAssign === 'true'
  const hourStr = hourSetting ?? ''
  const wd = new Set((wdSetting ?? '').split(',').filter(Boolean))
  const lastMs = Number(lastRunSetting)
  const hasLast = Number.isFinite(lastMs) && lastMs > 0
  const next = nextRunMs(hourStr, wd)
  const when =
    hourStr === '' ? 'continuously (every few min)' : next === null ? `${hourStr.padStart(2, '0')}:00 VN` : fmtVN(next)
  const last = hasLast ? `${fmtVN(lastMs)} (${relTime(lastMs)})` : 'not yet run'
  return (
    <span
      className={cn(
        'flex items-center gap-2 rounded-full border px-3 py-1 text-xs',
        on ? 'border-green-600/30 bg-green-600/10 text-green-700 dark:text-green-400' : 'text-muted-foreground'
      )}
      title={on ? `Next assign: ${when} · Last run: ${last}` : 'Auto-assign is off'}>
      <span
        className={cn(
          'size-1.5 rounded-full',
          on ? 'animate-pulse bg-green-600 dark:bg-green-400' : 'bg-muted-foreground/50'
        )}
      />
      {on ? `Next assign ${when} · last ${last}` : 'Agent off'}
    </span>
  )
}
const Card = ({
  children,
  disabled,
  onClick,
  title
}: {
  children: React.ReactNode
  disabled?: boolean
  onClick?: () => void
  title: string
}): React.ReactElement => (
  <button
    className='w-full rounded-lg border bg-card p-4 text-left transition-colors enabled:cursor-pointer enabled:hover:bg-muted disabled:cursor-default'
    disabled={disabled}
    onClick={onClick}
    type='button'>
    <div className='mb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wide'>{title}</div>
    {children}
  </button>
)
// oxlint-disable-next-line complexity
const TrainingPage = (): React.ReactElement => {
  const router = useRouter()
  const summary = useQuery(api.dashboard.trainingSummary, {})
  const autoAssign = useQuery(api.settings.getForAdmin, { key: 'agent_auto_assign_enabled' })
  const dueSetting = useQuery(api.settings.getForAdmin, { key: 'assignment_due_days' })
  const hourSetting = useQuery(api.settings.getForAdmin, { key: 'agent_auto_assign_hour' })
  const wdSetting = useQuery(api.settings.getForAdmin, { key: 'agent_auto_assign_weekdays' })
  const lastRunSetting = useQuery(api.settings.getForAdmin, { key: 'agent_auto_assign_last_run' })
  const setSetting = useMutation(api.settings.setForAdmin)
  const unassignAll = useMutation(api.trainingAssignments.unassignAllForTopic)
  const rearm = useMutation(api.training.markTopicSubstantive)
  const assignNow = useAction(api.training.assignEligibleNow)
  const assignComposer = useMutation(api.training.assignComposer)
  const [sSearch, setSSearch] = useState('')
  const [sPage, setSPage] = useState(0)
  const [sCoaching, setSCoaching] = useState(false)
  const userSum = useQuery(api.dashboard.userSummary, { needsCoaching: sCoaching, page: sPage, search: sSearch })
  const coaching = useQuery(api.dashboard.coachingSummary, {})
  const [drilldownUser, setDrilldownUser] = useState<null | string>(null)
  const drilldown = useQuery(api.dashboard.userAttemptHistory, drilldownUser ? { userId: drilldownUser } : 'skip')
  const [tSearch, setTSearch] = useState('')
  const [tPage, setTPage] = useState(0)
  const [pending, setPending] = useState<null | PendingAction>(null)
  const [running, setRunning] = useState(false)
  const [autoBusy, setAutoBusy] = useState(false)
  const [assignNowBusy, setAssignNowBusy] = useState(false)
  const [dueDraft, setDueDraft] = useState<null | string>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [cTopic, setCTopic] = useState('')
  const [cAudience, setCAudience] = useState<'all' | 'department' | 'selected'>('all')
  const [cDept, setCDept] = useState<string>('Safety, Health and Environment')
  const [cUserIds, setCUserIds] = useState<string[]>([])
  const [cDueDays, setCDueDays] = useState('')
  const [cBusy, setCBusy] = useState(false)
  const [agentOpen, setAgentOpen] = useState(false)
  const [hourDraft, setHourDraft] = useState<null | string>(null)
  const [wdDraft, setWdDraft] = useState<null | Set<string>>(null)
  const [schedBusy, setSchedBusy] = useState(false)
  const summaryRef = useRef<HTMLElement>(null)
  const switchId = useId()
  const dueId = useId()
  const hourId = useId()
  const cTopicId = useId()
  const cAudienceId = useId()
  const cDeptId = useId()
  const cDueId = useId()
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
      if (cAudience === 'selected' && cUserIds.length === 0) {
        toast.error('Pick at least one user')
        setCBusy(false)
        return
      }
      const r = await assignComposer({
        audience: cAudience,
        department: cAudience === 'department' ? cDept : undefined,
        dueAtMs,
        topicId: cTopic as never,
        userIds: cAudience === 'selected' ? cUserIds : undefined
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
  const goAtRisk = (): void => {
    setSCoaching(false)
    summaryRef.current?.scrollIntoView({ behavior: 'smooth' })
  }
  const goWeakest = (): void => {
    if (!summary.weakestTest) return
    router.push(`/training/tests/${slugify(summary.weakestTest.name)}`)
  }
  return (
    <div className='space-y-6 p-6'>
      <div className='flex flex-wrap items-center gap-4'>
        <h1 className='font-semibold text-xl'>Training</h1>
        <div className='ml-auto flex flex-wrap items-center gap-3'>
          <AgentStatusBadge
            autoAssign={autoAssign}
            hourSetting={hourSetting}
            lastRunSetting={lastRunSetting}
            wdSetting={wdSetting}
          />
          <Button
            onClick={() => {
              setCTopic(summary.tests[0]?.topicId ?? '')
              setCAudience('all')
              setCDueDays('')
              setCUserIds([])
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
      <section className='grid gap-3 md:grid-cols-2 lg:grid-cols-4'>
        <Card onClick={() => summaryRef.current?.scrollIntoView({ behavior: 'smooth' })} title='Overview'>
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
        </Card>
        <Card disabled={summary.atRiskCount === 0} onClick={goAtRisk} title='People at risk'>
          <div className={cn('font-bold text-3xl', summary.atRiskCount > 0 && 'text-yellow-700 dark:text-yellow-400')}>
            {summary.atRiskCount}
          </div>
          <div className='mt-1 text-muted-foreground text-sm'>
            {summary.atRiskCount === 0 ? 'everyone on track' : 'have unfinished or overdue tests — view who'}
          </div>
        </Card>
        <Card disabled={!summary.weakestTest} onClick={goWeakest} title='Weakest test'>
          {summary.weakestTest ? (
            <>
              <div className='truncate font-semibold' title={summary.weakestTest.name}>
                {summary.weakestTest.name}
              </div>
              <div className='mt-2 font-bold text-3xl'>{summary.weakestTest.passRate}%</div>
              <div className='text-muted-foreground text-sm'>pass rate — view assignments</div>
            </>
          ) : (
            <div className='text-muted-foreground text-sm'>No assigned tests yet</div>
          )}
        </Card>
        <Card
          disabled={!coaching || coaching.userCount === 0}
          onClick={() => {
            setSCoaching(true)
            setSPage(0)
            summaryRef.current?.scrollIntoView({ behavior: 'smooth' })
          }}
          title='Needs coaching'>
          <div
            className={cn(
              'font-bold text-3xl',
              coaching && coaching.userCount > 0 && 'text-yellow-700 dark:text-yellow-400'
            )}>
            {coaching?.userCount ?? 0}
          </div>
          <div className='mt-1 text-muted-foreground text-sm'>
            {!coaching || coaching.userCount === 0
              ? 'no repeat failures this cycle'
              : `failed ≥${coaching.threshold} tests in last 30 days — view who`}
          </div>
        </Card>
      </section>
      <section className='space-y-2'>
        <div className='flex flex-wrap items-center gap-3'>
          <h2 className='font-semibold text-lg'>Tests</h2>
          <Link className='text-muted-foreground text-sm hover:text-foreground hover:underline' href='/training/tests'>
            View all →
          </Link>
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
                    <TableCell className='font-medium'>
                      <Link className='hover:underline' href={`/training/tests/${slugify(t.name)}`}>
                        {t.name}
                      </Link>
                    </TableCell>
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
          <Link className='text-muted-foreground text-sm hover:text-foreground hover:underline' href='/training/users'>
            View all →
          </Link>
          <Input
            className='h-8 w-56'
            onChange={e => {
              setSSearch(e.target.value)
              setSPage(0)
            }}
            placeholder='Search user…'
            value={sSearch}
          />
          {sCoaching ? (
            <button
              className='rounded-full bg-yellow-500/15 px-2 py-0.5 text-xs text-yellow-700 hover:bg-yellow-500/25 dark:text-yellow-400'
              onClick={() => {
                setSCoaching(false)
                setSPage(0)
              }}
              type='button'>
              Showing repeat-failers only · clear
            </button>
          ) : null}
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
                  <TableHead className='text-right'>Failed</TableHead>
                  <TableHead className='text-right'>Overdue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {userSum.rows.map(u => (
                  <TableRow key={u.userId}>
                    <TableCell>
                      <button
                        className='text-left font-medium hover:underline'
                        onClick={() => setDrilldownUser(u.userId)}
                        type='button'>
                        {u.userId}
                      </button>
                    </TableCell>
                    <TableCell className='text-muted-foreground'>{u.department}</TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {u.passed}/{u.assigned}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums',
                        u.failedAttempts >= 3 && 'font-semibold text-destructive',
                        u.failedAttempts > 0 && u.failedAttempts < 3 && 'text-yellow-700 dark:text-yellow-400'
                      )}>
                      {u.failedAttempts}
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
      <AlertDialog
        onOpenChange={open => {
          if (!(open || running)) setPending(null)
        }}
        open={pending !== null}>
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
              <Label htmlFor={hourId}>Assign at (Vietnam time)</Label>
              <NativeSelect className='w-44' id={hourId} onChange={e => setHourDraft(e.target.value)} value={hourVal}>
                <NativeSelectOption value=''>Continuously (every few min)</NativeSelectOption>
                {HOURS.map(h => (
                  <NativeSelectOption key={h} value={h}>
                    {h.padStart(2, '0')}:00
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
              <Label htmlFor={cTopicId}>Test</Label>
              <NativeSelect id={cTopicId} onChange={e => setCTopic(e.target.value)} value={cTopic}>
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
              <Label htmlFor={cAudienceId}>Who</Label>
              <NativeSelect
                id={cAudienceId}
                onChange={e => setCAudience(e.target.value as 'all' | 'department' | 'selected')}
                value={cAudience}>
                <NativeSelectOption value='all'>Everyone</NativeSelectOption>
                <NativeSelectOption value='department'>A department</NativeSelectOption>
                <NativeSelectOption value='selected'>Specific people</NativeSelectOption>
              </NativeSelect>
            </div>
            {cAudience === 'department' ? (
              <div className='space-y-1'>
                <Label htmlFor={cDeptId}>Department</Label>
                <NativeSelect id={cDeptId} onChange={e => setCDept(e.target.value)} value={cDept}>
                  {DEPARTMENTS.map(d => (
                    <NativeSelectOption key={d} value={d}>
                      {d}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            ) : null}
            {cAudience === 'selected' ? (
              <div className='space-y-1'>
                <div className='font-medium text-sm'>People ({cUserIds.length} selected)</div>
                <div className='max-h-48 overflow-y-auto rounded border p-2 text-sm'>
                  {(userSum?.rows ?? []).map(u => (
                    <button
                      className='flex w-full items-center gap-2 py-0.5 text-left'
                      key={u.userId}
                      onClick={() =>
                        setCUserIds(prev =>
                          prev.includes(u.userId) ? prev.filter(x => x !== u.userId) : [...prev, u.userId]
                        )
                      }
                      type='button'>
                      <Checkbox checked={cUserIds.includes(u.userId)} />
                      <span className='font-mono text-xs'>{u.userId}</span>
                      <span className='text-muted-foreground text-xs'>· {u.department}</span>
                    </button>
                  ))}
                </div>
                <p className='text-muted-foreground text-xs'>
                  Showing this page of users (search to filter via the User summary table).
                </p>
              </div>
            ) : null}
            <div className='space-y-1'>
              <Label htmlFor={cDueId}>Overdue after (days)</Label>
              <Input
                className='w-32'
                id={cDueId}
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
      <Dialog
        onOpenChange={open => {
          if (!open) setDrilldownUser(null)
        }}
        open={drilldownUser !== null}>
        <DialogContent className='max-w-2xl'>
          <DialogHeader>
            <DialogTitle>Attempt history</DialogTitle>
            <DialogDescription>
              {drilldownUser ? <span className='font-mono text-xs'>{drilldownUser}</span> : null}
            </DialogDescription>
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
    </div>
  )
}
export default TrainingPage
