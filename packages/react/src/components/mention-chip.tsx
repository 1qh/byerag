/** biome-ignore-all lint/nursery/noUndeclaredClasses: standard tailwind v4 utilities biome cannot resolve */
'use client'
import { cn } from '@a/ui'
import { Badge } from '@a/ui/components/badge'
import { OneShotTooltip } from './one-shot-tooltip'

const KIND_TONES: Record<string, string> = {
  bookmark: 'border-amber-500/30 bg-amber-500/10 text-amber-700',
  collection: 'border-sky-500/30 bg-sky-500/10 text-sky-700',
  company: 'border-violet-500/30 bg-violet-500/10 text-violet-700',
  contact: 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-700',
  corridor: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-700',
  knowledge: 'border-purple-500/30 bg-purple-500/10 text-purple-700',
  me: 'border-foreground/30 bg-foreground/5 text-foreground',
  monitor: 'border-rose-500/30 bg-rose-500/10 text-rose-700',
  product: 'border-orange-500/30 bg-orange-500/10 text-orange-700',
  reminder: 'border-pink-500/30 bg-pink-500/10 text-pink-700',
  search: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-700',
  template: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
}
const DEFAULT_TONE = 'border-border/60 bg-muted/40 text-muted-foreground'
const NAME_SPLIT_RE = /[-_]/u
interface MentionChipProps {
  kind: string
  name?: string
  onClick?: () => void
  tombstone?: boolean
}
const humanizeName = (raw: string): string =>
  raw
    .split(NAME_SPLIT_RE)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
const MentionChip = ({ kind, name, onClick, tombstone }: MentionChipProps) => {
  const tone = KIND_TONES[kind] ?? DEFAULT_TONE
  const label = kind === 'me' ? 'Me' : name ? humanizeName(name) : kind
  const className = cn('text-[0.75rem] gap-1', onClick && 'cursor-pointer', tone, tombstone && 'line-through opacity-60')
  const inner = (
    <Badge className={className} variant='outline'>
      <span className='opacity-60 text-[0.65rem] uppercase tracking-wide'>{kind}</span>
      <span>{label}</span>
    </Badge>
  )
  const wrapped = onClick ? (
    <button className='inline-flex' onClick={onClick} type='button'>
      {inner}
    </button>
  ) : (
    inner
  )
  return (
    <span className='relative inline-flex'>
      {wrapped}
      <OneShotTooltip storageKey='mention-chip-explained'>
        Click any <span className='font-semibold'>colored chip</span> to open it in the side pane. Each color = a different
        kind (collection, template, company, etc.).
      </OneShotTooltip>
    </span>
  )
}
export { KIND_TONES, MentionChip }
export type { MentionChipProps }
