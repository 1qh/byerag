'use client'
import { api } from 'backend/convex/_generated/api'
import { useQuery } from 'convex/react'
import { use } from 'react'
const DocViewerPage = ({ params }: { params: Promise<{ docId: string }> }): React.ReactElement => {
  const { docId } = use(params)
  const result = useQuery(api.tools.docs.read.action as never, { id: docId }) as
    | undefined
    | {
        _id: string
        content: string
        filename: string
        lang: null | string
        mime: string
        scope: string
        truncated: boolean
        version: number
      }
  if (result === undefined) return <div className='p-6'>Loading…</div>
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
          // biome-ignore lint/correctness/useJsxKeyInIterable: line index is stable for static doc viewer
          <div className='target:bg-yellow-100' id={`L${i + 1}`} key={`L${i + 1}`}>
            {line || ' '}
          </div>
        ))}
      </pre>
    </div>
  )
}
export default DocViewerPage
