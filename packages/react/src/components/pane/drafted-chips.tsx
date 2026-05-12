'use client'
import type { DraftedLine } from './pane-context'
interface DraftedChipsProps {
  lines: readonly DraftedLine[]
  onRemove: (id: string) => void
}
const DraftedChips = ({ lines, onRemove }: DraftedChipsProps) => {
  if (lines.length === 0) return null
  return (
    <ul aria-label='drafted from clicks' className='mb-2 flex flex-wrap items-start gap-1.5 px-2'>
      {lines.map(l => (
        <li
          className='inline-flex max-w-full items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-xs text-foreground/90'
          key={l.id}>
          <span aria-hidden className='shrink-0 text-primary/70'>
            ↳
          </span>
          <span className='whitespace-pre-wrap break-words italic'>{l.text}</span>
          <button
            aria-label='remove drafted line'
            className='ml-0.5 shrink-0 rounded-sm px-1 text-muted-foreground hover:bg-muted hover:text-foreground'
            onClick={() => onRemove(l.id)}
            type='button'>
            ×
          </button>
        </li>
      ))}
    </ul>
  )
}
export { DraftedChips }
