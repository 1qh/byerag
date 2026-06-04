'use client'
import { cn } from '@a/ui'
import { Button } from '@a/ui/components/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@a/ui/components/dropdown-menu'
import { Input } from '@a/ui/components/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@a/ui/components/table'
import { api } from 'backend/convex/_generated/api'
import { useQuery } from 'convex/react'
import { ArrowLeft, ArrowUpDown, Download } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { AttemptHistoryModal } from '../_components/attempt-history-modal'
import { downloadCsv } from '../_components/csv'

type SortKey = 'department' | 'failed' | 'lastAttempt' | 'overdue' | 'passed' | 'passRate' | 'user'
const FILTER_TRIGGER = <Button className='-ml-2 h-auto gap-1 px-2 py-1 font-medium' size='sm' variant='ghost' />
const fmtDate = (ms?: number): string => (ms ? new Date(ms).toISOString().slice(0, 10) : '—')
const SortHeader = ({
  active,
  asc,
  label,
  onSort
}: {
  active: boolean
  asc: boolean
  label: string
  onSort: () => void
}): React.ReactElement => (
  <button className='inline-flex items-center gap-1 hover:text-foreground' onClick={onSort} type='button'>
    <span>{label}</span>
    <ArrowUpDown aria-hidden className={cn('size-3', !active && 'opacity-30', active && asc && 'rotate-180')} />
  </button>
)
const TrainingUsersPage = (): React.ReactElement => {
  const [search, setSearch] = useState('')
  const [needsCoaching, setNeedsCoaching] = useState(false)
  const [deptFilter, setDeptFilter] = useState<string[]>([])
  const [sortKey, setSortKey] = useState<SortKey>('failed')
  const [sortAsc, setSortAsc] = useState(false)
  const [page, setPage] = useState(0)
  const [drilldownUser, setDrilldownUser] = useState<null | string>(null)
  const data = useQuery(api.dashboard.userSummaryFull, {
    departments: deptFilter,
    needsCoaching,
    search
  })
  const sorted = useMemo(() => {
    if (!data) return []
    const cmp = (a: (typeof data.rows)[number], b: (typeof data.rows)[number]): number => {
      const dir = sortAsc ? 1 : -1
      switch (sortKey) {
        case 'department':
          return a.department.localeCompare(b.department) * dir
        case 'failed':
          return (a.failedAttempts - b.failedAttempts) * dir
        case 'lastAttempt':
          return ((a.lastAttemptMs ?? 0) - (b.lastAttemptMs ?? 0)) * dir
        case 'overdue':
          return (a.overdue - b.overdue) * dir
        case 'passed':
          return (a.passed - b.passed) * dir
        case 'passRate':
          return (a.passRate - b.passRate) * dir
        case 'user':
          return a.userId.localeCompare(b.userId) * dir
        default:
          return 0
      }
    }
    return [...data.rows].toSorted(cmp)
  }, [data, sortKey, sortAsc])
  const PAGE_SIZE = 100
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const clamped = Math.min(Math.max(0, page), pageCount - 1)
  const pageRows = sorted.slice(clamped * PAGE_SIZE, clamped * PAGE_SIZE + PAGE_SIZE)
  const toggleSort = (key: SortKey): void => {
    if (sortKey === key) setSortAsc(a => !a)
    else {
      setSortKey(key)
      setSortAsc(false)
    }
  }
  const onExport = (): void => {
    downloadCsv(
      sorted.map(r => ({
        Department: r.department,
        Failed: r.failedAttempts,
        'Last attempt': fmtDate(r.lastAttemptMs),
        'Most-failed topic': r.mostFailedTopic ?? '',
        Overdue: r.overdue,
        'Pass rate %': r.passRate,
        Passed: r.passed,
        Role: r.role,
        User: r.userId,
        assigned: r.assigned
      })),
      `training-users-${new Date().toISOString().slice(0, 10)}.csv`
    )
  }
  return (
    <div className='space-y-4 p-6'>
      <div className='flex items-center gap-2'>
        <Link
          className='inline-flex items-center gap-1 text-muted-foreground text-sm hover:text-foreground'
          href='/training'>
          <ArrowLeft aria-hidden className='size-3' />
          Training
        </Link>
      </div>
      <div className='flex flex-wrap items-baseline justify-between gap-3'>
        <h1 className='font-semibold text-2xl'>
          Trainees <span className='text-muted-foreground text-sm'>({data?.total ?? 0} total)</span>
        </h1>
        <Button onClick={onExport} size='sm' variant='outline'>
          <Download className='size-4' />
          Export CSV
        </Button>
      </div>
      <div className='flex flex-wrap items-center gap-2'>
        <Input
          className='h-9 w-64'
          onChange={e => {
            setSearch(e.target.value)
            setPage(0)
          }}
          placeholder='Search user…'
          value={search}
        />
        <DropdownMenu>
          <DropdownMenuTrigger render={FILTER_TRIGGER}>
            Department
            {deptFilter.length > 0 ? (
              <span className='rounded bg-primary/15 px-1 text-primary text-xs'>{deptFilter.length}</span>
            ) : null}
            <span className='text-muted-foreground text-xs'>▾</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='start' className='max-h-72 overflow-auto'>
            {(data?.departments ?? []).length === 0 ? (
              <DropdownMenuItem disabled>No departments</DropdownMenuItem>
            ) : (
              (data?.departments ?? []).map(d => (
                <DropdownMenuCheckboxItem
                  checked={deptFilter.includes(d)}
                  key={d}
                  onCheckedChange={() => setDeptFilter(p => (p.includes(d) ? p.filter(x => x !== d) : [...p, d]))}>
                  {d}
                </DropdownMenuCheckboxItem>
              ))
            )}
            {deptFilter.length > 0 ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setDeptFilter([])}>Clear</DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          className={cn(
            'rounded-full border px-3 py-1 text-xs transition',
            needsCoaching
              ? 'border-yellow-500/50 bg-yellow-500/15 text-yellow-700 hover:bg-yellow-500/25 dark:text-yellow-400'
              : 'border-transparent text-muted-foreground hover:bg-muted'
          )}
          onClick={() => {
            setNeedsCoaching(c => !c)
            setPage(0)
          }}
          type='button'>
          {needsCoaching ? 'Needs coaching · clear' : 'Needs coaching'}
        </button>
      </div>
      {data === undefined ? (
        <div className='text-muted-foreground'>Loading…</div>
      ) : data === null ? (
        <div className='text-destructive'>Admin only.</div>
      ) : sorted.length === 0 ? (
        <div className='text-muted-foreground'>No trainees match.</div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <SortHeader active={sortKey === 'user'} asc={sortAsc} label='User' onSort={() => toggleSort('user')} />
                </TableHead>
                <TableHead>
                  <SortHeader
                    active={sortKey === 'department'}
                    asc={sortAsc}
                    label='Department'
                    onSort={() => toggleSort('department')}
                  />
                </TableHead>
                <TableHead>Role</TableHead>
                <TableHead className='text-right'>
                  <SortHeader
                    active={sortKey === 'passed'}
                    asc={sortAsc}
                    label='Passed / assigned'
                    onSort={() => toggleSort('passed')}
                  />
                </TableHead>
                <TableHead className='text-right'>
                  <SortHeader
                    active={sortKey === 'failed'}
                    asc={sortAsc}
                    label='Failed'
                    onSort={() => toggleSort('failed')}
                  />
                </TableHead>
                <TableHead className='text-right'>
                  <SortHeader
                    active={sortKey === 'overdue'}
                    asc={sortAsc}
                    label='Overdue'
                    onSort={() => toggleSort('overdue')}
                  />
                </TableHead>
                <TableHead className='text-right'>
                  <SortHeader
                    active={sortKey === 'passRate'}
                    asc={sortAsc}
                    label='Pass rate'
                    onSort={() => toggleSort('passRate')}
                  />
                </TableHead>
                <TableHead className='text-right'>
                  <SortHeader
                    active={sortKey === 'lastAttempt'}
                    asc={sortAsc}
                    label='Last attempt'
                    onSort={() => toggleSort('lastAttempt')}
                  />
                </TableHead>
                <TableHead>Most-failed topic</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map(u => (
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
                  <TableCell className='text-muted-foreground text-xs'>{u.role}</TableCell>
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
                  <TableCell className='text-right tabular-nums'>{u.assigned === 0 ? '—' : `${u.passRate}%`}</TableCell>
                  <TableCell className='text-right text-muted-foreground text-xs'>{fmtDate(u.lastAttemptMs)}</TableCell>
                  <TableCell className='max-w-xs truncate text-muted-foreground text-sm' title={u.mostFailedTopic}>
                    {u.mostFailedTopic ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className='flex items-center justify-between text-muted-foreground text-sm'>
            <span>
              Showing {pageRows.length} of {sorted.length}
            </span>
            <div className='flex items-center gap-2'>
              <Button disabled={clamped === 0} onClick={() => setPage(p => p - 1)} size='sm' variant='outline'>
                Prev
              </Button>
              <span>
                {clamped + 1} / {pageCount}
              </span>
              <Button disabled={clamped + 1 >= pageCount} onClick={() => setPage(p => p + 1)} size='sm' variant='outline'>
                Next
              </Button>
            </div>
          </div>
        </>
      )}
      <AttemptHistoryModal onClose={() => setDrilldownUser(null)} userId={drilldownUser} />
    </div>
  )
}
export default TrainingUsersPage
