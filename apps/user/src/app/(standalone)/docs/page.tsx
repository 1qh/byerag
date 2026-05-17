'use client'
import type { Id } from 'backend/convex/_generated/dataModel'
import { DocUpload, DocViewer } from '@a/react/components'
import { cn } from '@a/ui'
import { api } from 'backend/convex/_generated/api'
import { useQuery } from 'convex/react'
import { useState } from 'react'
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
  return (
    <div className='flex h-dvh'>
      <aside className='flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-r p-4'>
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
      <main className='flex-1 overflow-auto'>
        {selected ? (
          <DocViewer docId={selected} />
        ) : (
          <p className='p-6 text-muted-foreground'>Select a doc on the left to view.</p>
        )}
      </main>
    </div>
  )
}
export default DocsPage
