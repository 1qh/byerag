'use client'
import type { Id } from 'backend/convex/_generated/dataModel'
import { DocUpload, DocViewer } from '@a/react/components'
import { cn } from '@a/ui'
import { api } from 'backend/convex/_generated/api'
import { useQuery } from 'convex/react'
import { FileText } from 'lucide-react'
import { useState } from 'react'

const clampW = (n: number): number => Math.min(640, Math.max(240, n))
interface DocRow {
  _id: Id<'docs'>
  filename: string
  version: number
}
const DocList = ({
  docs,
  onSelect,
  selected
}: {
  docs?: DocRow[]
  onSelect: (id: Id<'docs'>) => void
  selected: Id<'docs'> | null
}): React.ReactElement => (
  <ul className='space-y-1 text-sm'>
    {docs?.map(d => (
      <li key={d._id}>
        <button
          className={cn(
            'w-full truncate rounded px-2 py-1 text-left font-mono hover:bg-muted',
            selected === d._id && 'bg-muted font-semibold text-foreground'
          )}
          onClick={() => onSelect(d._id)}
          type='button'>
          {d.filename} <span className='text-muted-foreground'>v{d.version}</span>
        </button>
      </li>
    ))}
  </ul>
)
const DocsPage = (): React.ReactElement => {
  const mine = useQuery(api.docs.listMine, {})
  const shared = useQuery(api.docs.listShared, {})
  const [selected, setSelected] = useState<Id<'docs'> | null>(null)
  const [listW, setListW] = useState(320)
  const startResize = (e: React.PointerEvent): void => {
    e.preventDefault()
    const startX = e.clientX
    const startW = listW
    const move = (ev: PointerEvent): void => setListW(clampW(startW + ev.clientX - startX))
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  return (
    <div className='flex h-dvh'>
      <aside
        className='flex shrink-0 flex-col gap-4 overflow-y-auto border-r p-4'
        // oxlint-disable-next-line react-perf/jsx-no-new-object-as-prop -- width is stateful
        style={{ width: `${listW}px` }}>
        <section className='space-y-2'>
          <h2 className='font-semibold text-lg'>My docs</h2>
          <DocUpload scope='mine' />
          <DocList docs={mine} onSelect={setSelected} selected={selected} />
        </section>
        <section className='space-y-2'>
          <h2 className='font-semibold text-lg'>Shared corpus (read-only)</h2>
          <DocList docs={shared} onSelect={setSelected} selected={selected} />
        </section>
      </aside>
      <button
        aria-label='Resize document list'
        className='w-1 shrink-0 cursor-col-resize bg-border hover:bg-primary/40'
        onPointerDown={startResize}
        type='button'
      />
      <main className='flex-1 overflow-auto'>
        {selected ? (
          <DocViewer docId={selected} />
        ) : (
          <div className='flex h-full flex-col items-center justify-center gap-3 text-muted-foreground'>
            <FileText aria-hidden className='size-10 opacity-40' />
            <p className='font-medium'>Select a document to preview</p>
            <p className='text-sm'>Pick one of your files or a shared doc on the left.</p>
          </div>
        )}
      </main>
    </div>
  )
}
export default DocsPage
