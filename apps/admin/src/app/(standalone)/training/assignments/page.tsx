/* eslint-disable complexity */
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@a/ui/components/table'
import { api } from 'backend/convex/_generated/api'
import { useQuery } from 'convex/react'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'

const FILTER_TRIGGER = <Button className='-ml-2 h-auto gap-1 px-2 py-1 font-medium' size='sm' variant='ghost' />
const pad2 = (n: number): string => String(n).padStart(2, '0')
const fmtVN = (ms: number): string => {
  const v = new Date(ms + 7 * 3_600_000)
  return `${v.getUTCFullYear()}-${pad2(v.getUTCMonth() + 1)}-${pad2(v.getUTCDate())} ${pad2(v.getUTCHours())}:${pad2(v.getUTCMinutes())} VN`
}
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
    <DropdownMenuTrigger render={FILTER_TRIGGER}>
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
const AssignmentsHiddenPage = (): React.ReactElement => {
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
  const deptOptions = useMemo(() => at?.facets.departments ?? [], [at?.facets.departments])
  const testOptions = useMemo(() => at?.facets.tests ?? [], [at?.facets.tests])
  const statusOptions = useMemo(() => at?.facets.statuses ?? [], [at?.facets.statuses])
  const deadlineOptions = useMemo(() => at?.facets.deadlines ?? [], [at?.facets.deadlines])
  const assignedOptions = useMemo(() => at?.facets.assigneds ?? [], [at?.facets.assigneds])
  return (
    <div className='space-y-4 p-6'>
      <Link
        className='inline-flex items-center gap-1 text-muted-foreground text-sm hover:text-foreground'
        href='/training'>
        <ArrowLeft aria-hidden className='size-3' />
        Training
      </Link>
      <div>
        <h1 className='font-semibold text-2xl'>Assignments</h1>
        <p className='text-muted-foreground text-xs'>
          Internal page — not linked from the main training surface. Live filterable view of every assignment with
          column-header multi-selects.
        </p>
      </div>
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
                options={deptOptions}
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
                options={testOptions}
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
                options={statusOptions}
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
                options={deadlineOptions}
                selected={fDeadline}
              />
            </TableHead>
            <TableHead>
              <FilterHeader
                label='Assigned at'
                onChange={v => {
                  setFAssigned(v)
                  setAPage(0)
                }}
                options={assignedOptions}
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
                <TableCell className='text-muted-foreground tabular-nums'>{fmtVN(r.at)}</TableCell>
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
            <Button disabled={aPage + 1 >= at.pageCount} onClick={() => setAPage(p => p + 1)} size='sm' variant='outline'>
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
export default AssignmentsHiddenPage
