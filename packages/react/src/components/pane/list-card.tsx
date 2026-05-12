'use client'
import { Badge } from '@a/ui/components/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@a/ui/components/card'
import { usePaneSubject } from '../../hooks/use-pane-subject'
interface GenericListResult {
  count: number
  items: Record<string, unknown>[]
  summary: string
}
const TITLE_FIELDS = ['name', 'filename', 'toEmail', 'subject', 'refId', '_id'] as const
const SUB_FIELDS = ['description', 'subject', 'fromEmail', 'kind', 'signal'] as const
const titleField = (item: Record<string, unknown>): string => {
  for (const k of TITLE_FIELDS) {
    const v = item[k]
    if (typeof v === 'string') return v
  }
  return '?'
}
const subField = (item: Record<string, unknown>): null | string => {
  for (const k of SUB_FIELDS) {
    const v = item[k]
    if (typeof v === 'string') return v
  }
  return null
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
      <CardContent className='space-y-1 [&>div]:rounded-md [&>div]:border [&>div]:border-border/60 [&>div]:bg-background/50 [&>div]:px-3 [&>div]:py-2 [&>div]:text-xs'>
        {data.items.slice(0, 50).map((item, i) => (
          <div key={typeof item._id === 'string' ? item._id : i}>
            <div className='font-medium'>{titleField(item)}</div>
            {subField(item) ? <div className='text-muted-foreground mt-0.5'>{subField(item)}</div> : null}
          </div>
        ))}
        {data.count > 50 ? <div className='text-muted-foreground text-center'>...{data.count - 50} more</div> : null}
      </CardContent>
    </Card>
  )
}
export { ListCard }
export type { GenericListResult, ListCardProps }
