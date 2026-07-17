/** biome-ignore-all lint/nursery/noUndeclaredClasses: standard tailwind v4 utilities biome cannot resolve */
'use client'
import type { Id } from 'backend/convex/_generated/dataModel'
import { MessageResponse } from '@a/ui/components/ai-elements/message'
import { Button, buttonVariants } from '@a/ui/components/button'
import { api } from 'backend/convex/_generated/api'
import { useQuery } from 'convex/react'
import { Download, MessageSquare } from 'lucide-react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useDocSheet } from './doc-sheet-context'

const PdfPreview = dynamic(async () => import('./pdf-preview'), {
  loading: () => <p className='p-6 text-muted-foreground'>Loading PDF…</p>,
  ssr: false
})
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
interface DocPreviewProps {
  content: string
  filename: string
  isImage: boolean
  isMarkdown: boolean
  isOffice: boolean
  isPdf: boolean
  url: null | string
}
const DocPreview = ({
  content,
  filename,
  isImage,
  isMarkdown,
  isOffice,
  isPdf,
  url
}: DocPreviewProps): React.ReactElement => {
  if (isPdf && url) return <PdfPreview url={url} />
  if (isImage && url)
    return (
      <div className='relative h-[80vh] w-full'>
        <Image alt={filename} className='rounded-md border object-contain' fill src={url} unoptimized />
      </div>
    )
  if (isMarkdown) return <MessageResponse className='w-full'>{content}</MessageResponse>
  return (
    <>
      {isOffice ? (
        <p className='text-muted-foreground text-xs italic'>
          Preview shows text only. Use Download for the original formatting.
        </p>
      ) : null}
      <pre className='max-h-[80vh] overflow-auto whitespace-pre-wrap rounded-md border bg-muted p-4 font-sans text-sm leading-relaxed'>
        {content}
      </pre>
    </>
  )
}
const DocViewer = ({ docId }: DocViewerProps): React.ReactElement => {
  const result = useQuery(api.docs.read, { docId })
  const { close: closeDocSheet } = useDocSheet()
  const router = useRouter()
  if (result === undefined) return <p className='p-6 text-muted-foreground'>Loading…</p>
  if (result === null) return <p className='p-6 text-destructive'>Doc not found or access denied.</p>
  const { mime, url, content } = result
  const isPdf = mime === 'application/pdf'
  const isImage = mime.startsWith('image/')
  const isMarkdown = mime === 'text/markdown'
  const isOffice = OFFICE_MIMES.has(mime)
  const askAboutThis = (): void => {
    const draft = `Summarize the most important points in ${result.filename}.`
    try {
      globalThis.localStorage.setItem('draft-new', draft)
    } catch {
      /* Private-browsing storage rejection: nav still proceeds */
    }
    closeDocSheet()
    router.push('/')
  }
  return (
    <article className='space-y-3 p-6'>
      <header className='space-y-2'>
        <div className='flex flex-wrap items-start gap-2'>
          <div className='min-w-0 flex-1'>
            <h2 className='truncate font-semibold text-lg' title={result.filename}>
              {result.filename}
            </h2>
            <p className='text-muted-foreground text-xs'>
              {result.scope === 'shared' ? 'In the shared library' : 'Only you'} · v{result.version}
            </p>
          </div>
          <Button onClick={askAboutThis} size='sm'>
            <MessageSquare className='size-4' />
            Ask about this
          </Button>
          {url ? (
            <a className={buttonVariants({ size: 'sm', variant: 'outline' })} download={result.filename} href={url}>
              <Download className='size-4' />
              Download
            </a>
          ) : null}
        </div>
      </header>
      <DocPreview
        content={content}
        filename={result.filename}
        isImage={isImage}
        isMarkdown={isMarkdown}
        isOffice={isOffice}
        isPdf={isPdf}
        url={url}
      />
    </article>
  )
}
export { DocViewer }
