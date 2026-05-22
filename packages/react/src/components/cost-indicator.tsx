'use client'
import { parseWithCache } from '@a/react/parsers'
import { useMemo } from 'react'

const sumCost = (events: { content: string }[]): number => {
  let total = 0
  for (const e of events) {
    const parsed = parseWithCache(e)
    if (parsed?.type === 'result' && typeof parsed.result?.cost_usd === 'number') total += parsed.result.cost_usd
  }
  return total
}
const fmt = (usd: number): string => (usd < 0.01 ? `$${(usd * 100).toFixed(2)}¢` : `$${usd.toFixed(2)}`)
const CostIndicator = ({ events }: { events: { content: string }[] }) => {
  const cost = useMemo(() => sumCost(events), [events])
  if (cost === 0) return null
  return (
    <span
      className='inline-flex items-center gap-1 text-[10px] text-muted-foreground font-mono tabular-nums cursor-help'
      title={`Cumulative Anthropic API cost for this chat: ${fmt(cost)}`}>
      <span aria-hidden='true' className='size-1.5 rounded-full bg-primary/50' />
      {fmt(cost)}
    </span>
  )
}
export { CostIndicator }
