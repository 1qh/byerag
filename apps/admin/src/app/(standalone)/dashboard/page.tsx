'use client'
import { cn } from '@a/ui'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@a/ui/components/table'
import { api } from 'backend/convex/_generated/api'
import { useQuery } from 'convex/react'
import Link from 'next/link'
import { useState } from 'react'

const fmtCents = (cents: number): string => `$${(cents / 100).toFixed(2)}`
const fmtDelta = (delta: number): string => `${delta >= 0 ? '+' : '−'}${fmtCents(Math.abs(delta))}`
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const cycleLabel = (cycleStart: string): string => {
  const [y, m] = cycleStart.split('-')
  const mi = Number(m) - 1
  return `${MONTH_ABBR[mi] ?? m} ${y}`
}
const cycleSince = (cycleStart: string): string => {
  const [, m, d] = cycleStart.split('-')
  return `since ${MONTH_ABBR[Number(m) - 1] ?? m} ${Number(d)}`
}
interface HistoryItem {
  cents: number
  cycleEnd: string
  cycleStart: string
  isCurrent: boolean
}
interface InboxTile {
  count: number
  href: string
  label: string
  tone: 'attention' | 'info' | 'warning'
}
const trimHistory = (history: readonly HistoryItem[]): HistoryItem[] => {
  const arr = [...history].toReversed()
  const firstWithData = arr.findIndex(c => c.cents > 0 || c.isCurrent)
  return firstWithData === -1 ? arr.slice(-1) : arr.slice(firstWithData)
}
const CostHistorySection = ({
  history,
  onSelectCycle,
  selectedCycle
}: {
  history: readonly HistoryItem[]
  onSelectCycle: (cycleStart: string | undefined) => void
  selectedCycle: string | undefined
}): React.ReactElement => {
  const trimmed = trimHistory(history)
  const maxCents = Math.max(1, ...history.map(h => h.cents))
  return (
    <section>
      <div className='mb-2 flex items-baseline justify-between'>
        <h2 className='font-semibold text-lg'>Cost history</h2>
        <span className='text-muted-foreground text-xs'>
          {trimmed.length === 1 ? 'this cycle' : `last ${trimmed.length} cycles`} · click a bar to drill the pivot
        </span>
      </div>
      <div className='flex items-end gap-3'>
        {trimmed.map(c => {
          const heightPct = c.cents === 0 ? 2 : Math.max(6, (c.cents / maxCents) * 56)
          // oxlint-disable-next-line react-perf/jsx-no-new-object-as-prop -- height varies per bar
          const barStyle: React.CSSProperties = { height: `${heightPct}px` }
          const isSelected = selectedCycle === c.cycleStart
          return (
            <button
              className='flex flex-col items-center gap-1 text-xs'
              key={c.cycleStart}
              onClick={() => onSelectCycle(c.cycleStart === selectedCycle ? undefined : c.cycleStart)}
              type='button'>
              <div className={cn('text-muted-foreground', c.cents === 0 && 'invisible')}>{fmtCents(c.cents)}</div>
              <div
                className={cn(
                  'w-10 rounded-t',
                  c.isCurrent ? 'animate-pulse bg-primary/70' : 'bg-primary/80',
                  isSelected && 'ring-2 ring-foreground'
                )}
                style={barStyle}
              />
              <div className={cn(isSelected && 'font-semibold')}>{cycleLabel(c.cycleStart)}</div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
const toneClass = (tone: InboxTile['tone'], count: number): string => {
  if (count === 0) return 'border-border text-muted-foreground'
  if (tone === 'warning') return 'border-yellow-500/60 text-yellow-700 dark:text-yellow-400'
  if (tone === 'attention') return 'border-primary/60 text-foreground'
  return 'border-border text-foreground'
}
const DashboardPage = (): React.ReactElement => {
  const top = useQuery(api.dashboard.topStrip)
  const history = useQuery(api.dashboard.costCycleHistory, { count: 6 })
  const [selectedCycle, setSelectedCycle] = useState<string | undefined>(undefined)
  const pivot = useQuery(api.dashboard.costCyclePivot, { cycleStart: selectedCycle })
  if (top === undefined || pivot === undefined) return <div className='p-6'>Loading…</div>
  if (top === null) return <div className='p-6 text-destructive'>Admin role required.</div>
  const prevCycleCents = history && history.length > 1 ? (history[1]?.cents ?? 0) : 0
  const delta = top.cycleCents - prevCycleCents
  const inbox: InboxTile[] = [
    { count: top.pendingSuggestions, href: '/test-questions', label: 'Question suggestions to review', tone: 'attention' },
    { count: top.policyPendingDocs, href: '/policy', label: 'Docs awaiting policy decision', tone: 'attention' },
    { count: top.quarantineDocs, href: '/quarantine', label: 'Docs in quarantine', tone: 'warning' },
    { count: top.activeChats, href: '/users', label: 'Chats streaming right now', tone: 'info' }
  ]
  const sortedPivot = [...pivot].toSorted((a, b) => b.cents - a.cents)
  return (
    <div className='space-y-8 p-6'>
      <section className='grid gap-4 md:grid-cols-3'>
        <div className='rounded-lg border bg-card p-5 md:col-span-2'>
          <div className='flex items-baseline justify-between gap-3'>
            <div className='text-muted-foreground text-sm'>Cost this cycle ({cycleSince(top.cycleStart)})</div>
            {history && history.length > 1 ? (
              <div className={cn('text-xs', delta > 0 ? 'text-yellow-700 dark:text-yellow-400' : 'text-muted-foreground')}>
                {fmtDelta(delta)} vs last cycle ({fmtCents(prevCycleCents)})
              </div>
            ) : null}
          </div>
          <div className='mt-1 font-bold text-4xl'>{fmtCents(top.cycleCents)}</div>
        </div>
        <div className='rounded-lg border bg-card p-5'>
          <div className='text-muted-foreground text-sm'>Corpus</div>
          <div className='mt-2 flex items-baseline gap-4'>
            <div>
              <div className='font-semibold text-2xl'>{top.totalUsers}</div>
              <div className='text-muted-foreground text-xs'>users</div>
            </div>
            <div>
              <div className='font-semibold text-2xl'>{top.docsInCorpus}</div>
              <div className='text-muted-foreground text-xs'>shared docs</div>
            </div>
          </div>
        </div>
      </section>
      <section>
        <h2 className='mb-2 font-semibold text-sm uppercase tracking-wide text-muted-foreground'>Needs your attention</h2>
        <div className='grid gap-3 md:grid-cols-4'>
          {inbox.map(t => (
            <Link
              className={cn(
                'flex items-center justify-between rounded-lg border bg-card p-4 transition hover:bg-muted',
                toneClass(t.tone, t.count)
              )}
              href={t.href}
              key={t.label}>
              <div className='text-sm leading-tight'>{t.label}</div>
              <div className='font-bold text-2xl tabular-nums'>{t.count}</div>
            </Link>
          ))}
        </div>
      </section>
      {history && history.length > 0 ? (
        <CostHistorySection history={history} onSelectCycle={setSelectedCycle} selectedCycle={selectedCycle} />
      ) : null}
      <section>
        <h2 className='mb-2 font-semibold text-lg'>
          Top spenders ({selectedCycle ? cycleLabel(selectedCycle) : 'this cycle'})
        </h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Owner</TableHead>
              <TableHead className='text-right'>Input</TableHead>
              <TableHead className='text-right'>Output</TableHead>
              <TableHead className='text-right'>Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedPivot.length === 0 ? (
              <TableRow>
                <TableCell className='text-muted-foreground' colSpan={4}>
                  No usage yet this cycle.
                </TableCell>
              </TableRow>
            ) : (
              sortedPivot.map((r, i) => (
                <TableRow className={cn(i === 0 && r.cents > 0 && 'bg-muted/50')} key={`${r.owner}|${r.model}`}>
                  <TableCell className={cn(i === 0 && r.cents > 0 && 'font-semibold')}>
                    <Link className='hover:underline' href={`/users/${encodeURIComponent(r.owner)}/cost`}>
                      {r.owner}
                    </Link>
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>{r.inputTokens.toLocaleString()}</TableCell>
                  <TableCell className='text-right tabular-nums'>{r.outputTokens.toLocaleString()}</TableCell>
                  <TableCell className='text-right tabular-nums'>{fmtCents(r.cents)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          {sortedPivot.length > 0 ? (
            <TableFooter>
              <TableRow>
                <TableCell>Total</TableCell>
                <TableCell className='text-right tabular-nums'>
                  {sortedPivot.reduce((s, r) => s + r.inputTokens, 0).toLocaleString()}
                </TableCell>
                <TableCell className='text-right tabular-nums'>
                  {sortedPivot.reduce((s, r) => s + r.outputTokens, 0).toLocaleString()}
                </TableCell>
                <TableCell className='text-right tabular-nums'>
                  {fmtCents(sortedPivot.reduce((s, r) => s + r.cents, 0))}
                </TableCell>
              </TableRow>
            </TableFooter>
          ) : null}
        </Table>
      </section>
    </div>
  )
}
export default DashboardPage
