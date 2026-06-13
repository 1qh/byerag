/** biome-ignore-all lint/nursery/noUndeclaredClasses: standard tailwind v4 utilities biome cannot resolve */
'use client'
import type { ContentBlock } from 'backend/convex/streamProtocol'
import { sourceToChunks } from '@a/react/parsers'
import { Button } from '@a/ui/components/button'
import { DownloadIcon } from 'lucide-react'

const fenceFor = (s: string): string => {
  const m = s.match(/`{3,}/gu)
  const maxRun = m ? Math.max(...m.map(x => x.length)) : 0
  return '`'.repeat(Math.max(3, maxRun + 1))
}
const fenced = (body: string, lang = ''): string => {
  const f = fenceFor(body)
  return `${f}${lang}\n${body}\n${f}`
}
const fmtBlock = (b: ContentBlock): string => {
  if (b.type === 'text' && b.text) return b.text
  if ('thinking' in b && b.thinking) return `> ${b.thinking.replaceAll('\n', '\n> ')}`
  if (b.type === 'tool_use' || b.type === 'server_tool_use') {
    const name = b.name ?? 'tool'
    const input = b.input ? JSON.stringify(b.input, null, 2) : '{}'
    return `**→ ${name}**\n\n${fenced(input, 'json')}`
  }
  if (b.type === 'tool_result' || b.type === 'code_execution_tool_result') {
    const content = typeof b.content === 'string' ? b.content : JSON.stringify(b.content, null, 2)
    return `**← tool result**\n\n${fenced(content.slice(0, 4000))}`
  }
  return ''
}
const chunkToMarkdown = (c: ReturnType<typeof sourceToChunks>[number]): string => {
  if (c.kind === 'user-text') return `### User\n\n${c.text}`
  if (c.kind === 'partial') return `### Assistant\n\n${c.text}`
  if (c.kind === 'status') return `### Status\n\n_${c.text}_`
  const parts: string[] = ['### Assistant']
  for (const b of c.blocks) {
    const s = fmtBlock(b)
    if (s) parts.push(s)
  }
  return parts.join('\n\n')
}
const toMarkdown = (events: { _id: string; content: string }[]): string => {
  const chunks = sourceToChunks(events)
  return chunks.map(chunkToMarkdown).filter(Boolean).join('\n\n---\n\n')
}
const ExportChat = ({ events, title }: { events: { _id: string; content: string }[]; title: string }) => {
  const onDownload = (): void => {
    const md = toMarkdown(events)
    if (!md) return
    const blob = new Blob([`# ${title}\n\n${md}\n`], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const link = globalThis.document.createElement('a')
    link.href = url
    link.download = `${title.replaceAll(/[^a-z0-9-]+/giu, '-').slice(0, 60) || 'chat'}.md`
    globalThis.document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => {
      URL.revokeObjectURL(url)
    }, 0)
  }
  if (events.length === 0) return null
  return (
    <Button className='text-[10px] text-muted-foreground h-5 gap-1' onClick={onDownload} size='sm' variant='ghost'>
      <DownloadIcon className='size-3' />
      Export
    </Button>
  )
}
export { ExportChat }
