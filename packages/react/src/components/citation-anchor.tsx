/** biome-ignore-all lint/nursery/noUndeclaredClasses: standard tailwind v4 utilities biome cannot resolve */
'use client'
import type { Id } from 'backend/convex/_generated/dataModel'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@a/ui'
import { Badge } from '@a/ui/components/badge'
import { api } from 'backend/convex/_generated/api'
import { useQuery } from 'convex/react'
import { useDocSheet } from './doc-sheet-context'

const DOC_HREF_RE = /^\/docs\/(?<docId>[^/#?§%]+)(?:%C2%A7|§)?(?<sectionInPath>[^/#?]*)(?:#(?<anchor>[^?]+))?$/u
const DOC_ID_RE = /^[a-z0-9]+$/u
interface CitationAnchorProps extends ComponentProps<'a'> {
  children?: ReactNode
}
const Inner = ({ docId, anchor, children }: { anchor?: string; children?: ReactNode; docId: string }) => {
  const meta = useQuery(api.docs.getCitationBadge, { docId: docId as Id<'docs'> })
  const { openDoc } = useDocSheet()
  const badge = meta?.badge ?? 'fresh'
  const tone =
    badge === 'deleted'
      ? 'border-rose-500/40 bg-rose-500/10 text-rose-700 line-through'
      : badge === 'superseded'
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-700'
        : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
  const href = `/docs/${docId}${anchor ? `#${anchor}` : ''}`
  const onClick = (e: React.MouseEvent<HTMLAnchorElement>): void => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    openDoc(docId, anchor ?? null)
  }
  return (
    <a href={href} onClick={onClick} title={meta?.filename ?? undefined}>
      <Badge className={cn('text-[0.7rem] gap-1', tone)} variant='outline'>
        <span className='opacity-60 text-[0.6rem] uppercase tracking-wide'>{badge}</span>
        <span>{children ?? meta?.filename ?? docId}</span>
        {meta && meta.version > 1 ? <span className='opacity-70'>v{meta.version}</span> : null}
      </Badge>
    </a>
  )
}
const CitationAnchor = ({ href, children, ...rest }: CitationAnchorProps) => {
  if (typeof href !== 'string') return <a {...rest}>{children}</a>
  const m = DOC_HREF_RE.exec(href)
  const g = m?.groups
  if (!(g?.docId && DOC_ID_RE.test(g.docId)))
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    )
  const anchorFromPath = g.sectionInPath && g.sectionInPath.length > 0 ? g.sectionInPath : undefined
  return (
    <Inner anchor={g.anchor ?? anchorFromPath} docId={g.docId}>
      {children}
    </Inner>
  )
}
export { CitationAnchor }
