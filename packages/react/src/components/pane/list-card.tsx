/** biome-ignore-all lint/nursery/noUndeclaredClasses: standard tailwind v4 utilities biome cannot resolve */
'use client'
import { cn } from '@a/ui'
import { Badge } from '@a/ui/components/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@a/ui/components/card'
import { usePaneSubject } from '../../hooks/use-pane-subject'

const ROW_CLASS = 'rounded-md border border-border/60 bg-background/50 px-3 py-2 text-xs'
interface GenericListResult {
  count: number
  items: Record<string, unknown>[]
  summary: string
}
const ID_FIELDS = ['_id', 'id', 'refId'] as const
const TITLE_FIELDS = ['name', 'filename', 'toEmail', 'subject', 'refId', '_id'] as const
const SUB_FIELDS = ['description', 'subject', 'fromEmail', 'kind', 'signal'] as const
const titleField = (item: Record<string, unknown>): string => {
  for (const k of TITLE_FIELDS) {
    const v = item[k]
    if (typeof v === 'string') return v
  }
  return '?'
}
const identityOf = (item: Record<string, unknown>): null | string => {
  for (const k of ID_FIELDS) {
    const v = item[k]
    if (typeof v === 'string' && v) return v
  }
  const title = titleField(item)
  return title === '?' ? null : title
}
const subField = (item: Record<string, unknown>): null | string => {
  for (const k of SUB_FIELDS) {
    const v = item[k]
    if (typeof v === 'string') return v
  }
  return null
}
interface KeyedRow {
  item: Record<string, unknown>
  key: string
}
const keyedRows = (items: Record<string, unknown>[]): KeyedRow[] => {
  const seen = new Map<string, number>()
  return items.map(item => {
    const base = identityOf(item) ?? JSON.stringify(item)
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    return { item, key: n === 0 ? base : `${base}#${n}` }
  })
}
interface ListCardProps {
  data: GenericListResult
  label: string
  paneKind?: null | string
}
const ListCard = ({ data, label, paneKind }: ListCardProps) => {
  usePaneSubject(paneKind ?? null, label, data)
  return (
    <Card className='w-full'>
      <CardHeader className='pb-2'>
        <CardTitle className='text-sm font-normal flex items-center gap-2'>
          <span className='text-muted-foreground text-xs'>{label}</span>
          <Badge className='ml-auto' variant='default'>
            {data.count}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-1'>
        {keyedRows(data.items.slice(0, 50)).map(({ item, key }) => (
          <div className={cn(ROW_CLASS)} key={key}>
            <div className='font-medium'>{titleField(item)}</div>
            {subField(item) ? <div className='text-muted-foreground mt-0.5'>{subField(item)}</div> : null}
          </div>
        ))}
        {data.count > 50 ? (
          <div className={cn(ROW_CLASS, 'text-muted-foreground text-center')}>...{data.count - 50} more</div>
        ) : null}
      </CardContent>
    </Card>
  )
}
export { ListCard }
export type { GenericListResult, ListCardProps }
