/* eslint-disable complexity */
'use client'
import { cn } from '@a/ui'
import { Button } from '@a/ui/components/button'
import { Input } from '@a/ui/components/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@a/ui/components/table'
import { api } from 'backend/convex/_generated/api'
import { useQuery } from 'convex/react'
import { ArrowLeft, ArrowUpDown, Download } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'

type SortKey = 'assigned' | 'createdAt' | 'lastActivity' | 'name' | 'overdue' | 'passRate' | 'poolSize' | 'sourceDocs'
const fmtDate = (ms?: number): string => (ms && ms > 0 ? new Date(ms).toISOString().slice(0, 10) : '—')
const csvEscape = (s: string): string => (/[",\n]/u.test(s) ? `"${s.replaceAll('"', '""')}"` : s)
const downloadCsv = (rows: Record<string, unknown>[], filename: string): void => {
  if (rows.length === 0) return
  const headers = Object.keys(rows[0] ?? {})
  const lines = [headers.join(',')]
  for (const r of rows) lines.push(headers.map(h => csvEscape(String(r[h] ?? ''))).join(','))
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
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
const TrainingTestsListPage = (): React.ReactElement => {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('passRate')
  const [sortAsc, setSortAsc] = useState(true)
  const data = useQuery(api.dashboard.testsFull, { search })
  const sorted = useMemo(() => {
    if (!data) return []
    const cmp = (a: (typeof data.rows)[number], b: (typeof data.rows)[number]): number => {
      const dir = sortAsc ? 1 : -1
      switch (sortKey) {
        case 'name':
          return a.name.localeCompare(b.name) * dir
        case 'poolSize':
          return (a.poolSize - b.poolSize) * dir
        case 'assigned':
          return (a.assigned - b.assigned) * dir
        case 'passRate':
          return (a.passRate - b.passRate) * dir
        case 'overdue':
          return (a.overdue - b.overdue) * dir
        case 'createdAt':
          return (a.createdAt - b.createdAt) * dir
        case 'sourceDocs':
          return (a.sourceDocsCount - b.sourceDocsCount) * dir
        case 'lastActivity':
          return ((a.lastActivityMs ?? 0) - (b.lastActivityMs ?? 0)) * dir
        default:
          return 0
      }
    }
    return [...data.rows].toSorted(cmp)
  }, [data, sortKey, sortAsc])
  const toggleSort = (key: SortKey): void => {
    if (sortKey === key) setSortAsc(a => !a)
    else {
      setSortKey(key)
      setSortAsc(true)
    }
  }
  const onExport = (): void => {
    downloadCsv(
      sorted.map(r => ({
        Assigned: r.assigned,
        Created: fmtDate(r.createdAt),
        'Last activity': fmtDate(r.lastActivityMs),
        Name: r.name,
        Overdue: r.overdue,
        'Pass rate %': r.passRate,
        Questions: r.poolSize,
        Slug: r.slug,
        'Source docs': r.sourceDocsCount
      })),
      `training-tests-${new Date().toISOString().slice(0, 10)}.csv`
    )
  }
  return (
    <div className='space-y-4 p-6'>
      <Link
        className='inline-flex items-center gap-1 text-muted-foreground text-sm hover:text-foreground'
        href='/training'>
        <ArrowLeft aria-hidden className='size-3' />
        Training
      </Link>
      <div className='flex flex-wrap items-baseline justify-between gap-3'>
        <h1 className='font-semibold text-2xl'>
          Tests <span className='text-muted-foreground text-sm'>({data?.total ?? 0} total)</span>
        </h1>
        <Button onClick={onExport} size='sm' variant='outline'>
          <Download className='size-4' />
          Export CSV
        </Button>
      </div>
      <Input
        className='h-9 w-64'
        onChange={e => setSearch(e.target.value)}
        placeholder='Search test name…'
        value={search}
      />
      {data === undefined ? (
        <div className='text-muted-foreground'>Loading…</div>
      ) : data === null ? (
        <div className='text-destructive'>Admin only.</div>
      ) : sorted.length === 0 ? (
        <div className='text-muted-foreground'>No tests yet. Approve shared docs to seed the question bank.</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <SortHeader active={sortKey === 'name'} asc={sortAsc} label='Test' onSort={() => toggleSort('name')} />
              </TableHead>
              <TableHead className='text-right'>
                <SortHeader
                  active={sortKey === 'poolSize'}
                  asc={sortAsc}
                  label='Questions'
                  onSort={() => toggleSort('poolSize')}
                />
              </TableHead>
              <TableHead className='text-right'>
                <SortHeader
                  active={sortKey === 'assigned'}
                  asc={sortAsc}
                  label='Assigned'
                  onSort={() => toggleSort('assigned')}
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
                  active={sortKey === 'overdue'}
                  asc={sortAsc}
                  label='Overdue'
                  onSort={() => toggleSort('overdue')}
                />
              </TableHead>
              <TableHead className='text-right'>
                <SortHeader
                  active={sortKey === 'sourceDocs'}
                  asc={sortAsc}
                  label='Source docs'
                  onSort={() => toggleSort('sourceDocs')}
                />
              </TableHead>
              <TableHead className='text-right'>
                <SortHeader
                  active={sortKey === 'createdAt'}
                  asc={sortAsc}
                  label='Created'
                  onSort={() => toggleSort('createdAt')}
                />
              </TableHead>
              <TableHead className='text-right'>
                <SortHeader
                  active={sortKey === 'lastActivity'}
                  asc={sortAsc}
                  label='Last activity'
                  onSort={() => toggleSort('lastActivity')}
                />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map(t => (
              <TableRow key={t.topicId}>
                <TableCell className='font-medium'>
                  <Link className='hover:underline' href={`/training/tests/${t.slug}`}>
                    {t.name}
                  </Link>
                </TableCell>
                <TableCell className='text-right tabular-nums'>{t.poolSize}</TableCell>
                <TableCell className='text-right tabular-nums'>{t.assigned}</TableCell>
                <TableCell className='text-right tabular-nums'>{t.assigned === 0 ? '—' : `${t.passRate}%`}</TableCell>
                <TableCell
                  className={cn(
                    'text-right tabular-nums',
                    t.overdue > 0 && 'font-semibold text-yellow-700 dark:text-yellow-400'
                  )}>
                  {t.overdue}
                </TableCell>
                <TableCell className='text-right tabular-nums'>{t.sourceDocsCount}</TableCell>
                <TableCell className='text-right text-muted-foreground text-xs'>{fmtDate(t.createdAt)}</TableCell>
                <TableCell className='text-right text-muted-foreground text-xs'>{fmtDate(t.lastActivityMs)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
export default TrainingTestsListPage
