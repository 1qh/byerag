'use client'
import { Button } from '@a/ui/components/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
const PdfPreview = ({ url }: { url: string }): React.ReactElement => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(620)
  const [numPages, setNumPages] = useState(0)
  const [pageNumber, setPageNumber] = useState(1)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    // eslint-disable-next-line @eslint-react/hooks-extra/no-direct-set-state-in-use-effect -- ResizeObserver derives state from layout
    const update = (): void => setWidth(Math.max(320, el.clientWidth - 8))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div className='flex flex-col gap-2'>
      <div className='flex items-center justify-between rounded-md border bg-muted/30 px-2 py-1 text-sm'>
        <Button
          disabled={pageNumber <= 1}
          onClick={() => setPageNumber(n => Math.max(1, n - 1))}
          size='sm'
          variant='ghost'>
          <ChevronLeft className='size-4' />
          Prev
        </Button>
        <span className='text-muted-foreground text-xs tabular-nums'>
          {numPages > 0 ? `Page ${pageNumber} of ${numPages}` : 'Loading…'}
        </span>
        <Button
          disabled={pageNumber >= numPages}
          onClick={() => setPageNumber(n => Math.min(numPages, n + 1))}
          size='sm'
          variant='ghost'>
          Next
          <ChevronRight className='size-4' />
        </Button>
      </div>
      <div className='max-h-[80vh] overflow-auto rounded-md border bg-muted/20' ref={containerRef}>
        <Document file={url} loading='Loading PDF…' onLoadSuccess={({ numPages: n }) => setNumPages(n)}>
          <Page pageNumber={pageNumber} renderAnnotationLayer={false} renderTextLayer={false} width={width} />
        </Document>
      </div>
    </div>
  )
}
export default PdfPreview
