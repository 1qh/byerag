'use client'
import type { Id } from 'backend/convex/_generated/dataModel'
import { MessageResponse } from '@a/ui/components/ai-elements/message'
import { api } from 'backend/convex/_generated/api'
import { useQuery } from 'convex/react'
interface DocViewerProps {
  docId: Id<'docs'>
}
const DocViewer = ({ docId }: DocViewerProps): React.ReactElement => {
  const result = useQuery(api.docs.read, { docId })
  if (result === undefined) return <p className='p-6 text-muted-foreground'>Loading…</p>
  if (result === null) return <p className='p-6 text-destructive'>Doc not found or access denied.</p>
  return (
    <article className='space-y-3 p-6'>
      <header>
        <h2 className='font-semibold text-lg'>{result.filename}</h2>
        <p className='text-muted-foreground text-xs'>
          {result.mime} · v{result.version} · scope={result.scope} · lang={result.lang ?? '—'}
          {result.truncated ? ' · TRUNCATED' : null}
        </p>
      </header>
      <MessageResponse className='w-full'>{result.content}</MessageResponse>
    </article>
  )
}
export { DocViewer }
