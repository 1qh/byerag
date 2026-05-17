'use client'
import type { Id } from 'backend/convex/_generated/dataModel'
import { api } from 'backend/convex/_generated/api'
import { useQuery } from 'convex/react'
interface DocViewerProps {
  docId: Id<'docs'>
}
const DocViewer = ({ docId }: DocViewerProps): React.ReactElement => {
  const result = useQuery(api.docs.read, { docId })
  if (result === undefined) return <div className='p-6 text-muted-foreground'>Loading…</div>
  if (result === null) return <div className='p-6 text-destructive'>Doc not found or access denied.</div>
  const lines = result.content.split('\n')
  return (
    <div className='space-y-3 p-6'>
      <div>
        <h2 className='font-semibold text-lg'>{result.filename}</h2>
        <div className='text-muted-foreground text-xs'>
          {result.mime} · v{result.version} · scope={result.scope} · lang={result.lang ?? '—'}
          {result.truncated ? ' · TRUNCATED' : null}
        </div>
      </div>
      <pre className='whitespace-pre-wrap rounded-md border bg-muted p-4 font-mono text-sm'>
        {lines.map((line, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: line index is stable for static doc viewer
          <div className='target:bg-yellow-100' id={`L${i + 1}`} key={`id-${docId}-L${i + 1}`}>
            {line || ' '}
          </div>
        ))}
      </pre>
    </div>
  )
}
export { DocViewer }
