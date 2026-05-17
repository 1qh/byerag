'use client'
import type { Id } from 'backend/convex/_generated/dataModel'
import { MessageResponse } from '@a/ui/components/ai-elements/message'
import { api } from 'backend/convex/_generated/api'
import { useQuery } from 'convex/react'
interface DocViewerProps {
  docId: Id<'docs'>
}
const OFFICE_MIMES = new Set([
  'application/epub+zip',
  'application/rtf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
])
const DocViewer = ({ docId }: DocViewerProps): React.ReactElement => {
  const result = useQuery(api.docs.read, { docId })
  if (result === undefined) return <p className='p-6 text-muted-foreground'>Loading…</p>
  if (result === null) return <p className='p-6 text-destructive'>Doc not found or access denied.</p>
  const { mime, url, content } = result
  const isPdf = mime === 'application/pdf'
  const isImage = mime.startsWith('image/')
  const isMarkdown = mime === 'text/markdown'
  const isOffice = OFFICE_MIMES.has(mime)
  return (
    <article className='space-y-3 p-6'>
      <header>
        <h2 className='font-semibold text-lg'>{result.filename}</h2>
        <p className='text-muted-foreground text-xs'>
          {mime} · v{result.version} · scope={result.scope} · lang={result.lang ?? '—'}
          {result.truncated ? ' · TRUNCATED' : null}
          {isPdf && url ? (
            <a className='ml-2 text-primary underline' href={url} rel='noreferrer' target='_blank'>
              open in new tab
            </a>
          ) : null}
        </p>
      </header>
      {isPdf && url ? (
        <iframe className='h-[80vh] w-full rounded-md border' src={url} title={result.filename} />
      ) : isImage && url ? (
        <img alt={result.filename} className='max-h-[80vh] rounded-md border object-contain' src={url} />
      ) : isMarkdown ? (
        <MessageResponse className='w-full'>{content}</MessageResponse>
      ) : (
        <>
          {isOffice ? (
            <p className='flex items-center gap-2 rounded-md border bg-muted px-3 py-2 text-muted-foreground text-xs'>
              Preview is extracted text — original formatting (tables, images, layout) not preserved.
              {url ? (
                <a className='ml-auto text-primary underline' href={url} rel='noreferrer' target='_blank'>
                  Download original
                </a>
              ) : null}
            </p>
          ) : null}
          <pre className='max-h-[80vh] overflow-auto whitespace-pre-wrap rounded-md border bg-muted p-4 font-mono text-sm'>
            {content}
          </pre>
        </>
      )}
    </article>
  )
}
export { DocViewer }
