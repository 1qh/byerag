'use client'
import type { ComponentType, SVGProps } from 'react'
import { cn } from '@a/ui'
import { Badge } from '@a/ui/components/badge'
import {
  Bell,
  Bookmark,
  Briefcase,
  Building2,
  FileText,
  FolderOpen,
  Mail,
  MapPin,
  Package,
  Search,
  User
} from 'lucide-react'
import { useMemo } from 'react'
import type { ActiveMention } from '../hooks/use-mention-parser'
import { KIND_TONES } from './mention-chip'

interface MentionItem {
  kind: string
  lastModifiedAt?: number
  name: string
  summary?: string
}
const KIND_LABEL: Record<string, string> = {
  bookmark: 'Bookmarks',
  collection: 'Collections',
  company: 'Companies',
  contact: 'Contacts',
  corridor: 'Corridors',
  knowledge: 'Knowledge',
  me: 'Profile',
  monitor: 'Monitors',
  product: 'Products',
  reminder: 'Reminders',
  search: 'Searches',
  template: 'Templates'
}
type IconCmp = ComponentType<SVGProps<SVGSVGElement>>
const KIND_ICON: Record<string, IconCmp> = {
  bookmark: Bookmark,
  collection: FolderOpen,
  company: Building2,
  contact: Mail,
  corridor: MapPin,
  knowledge: FileText,
  me: User,
  monitor: Search,
  product: Package,
  reminder: Bell,
  search: Search,
  template: Briefcase
}
const KIND_ORDER = [
  'collection',
  'template',
  'knowledge',
  'product',
  'search',
  'reminder',
  'monitor',
  'bookmark',
  'company',
  'contact',
  'me'
]
const CREATABLE = new Set(['bookmark', 'collection', 'knowledge', 'monitor', 'product', 'reminder', 'template'])
const fuzzy = (q: string, target: string): boolean => {
  if (!q) return true
  const lower = target.toLowerCase()
  const ql = q.toLowerCase()
  let i = 0
  for (const ch of lower) {
    if (ch === ql.charAt(i)) i += 1
    if (i === ql.length) return true
  }
  return false
}
interface Suggestion {
  createNew?: boolean
  insertText: string
  item: MentionItem
}
const buildSuggestions = (items: MentionItem[], active: ActiveMention): Suggestion[] => {
  const { kindFragment, nameFragment } = active
  const meMatches = kindFragment === '' || fuzzy(kindFragment, 'me')
  const filtered = items.filter(it => {
    if (kindFragment && !fuzzy(kindFragment, it.kind)) return false
    if (nameFragment !== null && nameFragment.length > 0 && !fuzzy(nameFragment, it.name)) return false
    return true
  })
  const sorted = filtered.toSorted((a, b) => {
    const ai = KIND_ORDER.indexOf(a.kind)
    const bi = KIND_ORDER.indexOf(b.kind)
    if (ai !== bi) return ai - bi
    return (b.lastModifiedAt ?? 0) - (a.lastModifiedAt ?? 0)
  })
  const out: Suggestion[] = sorted.map(item => ({
    insertText: item.kind === 'me' ? '@me ' : `@${item.kind}:${item.name} `,
    item
  }))
  const showMe = kindFragment === 'me' || (kindFragment === '' && meMatches && nameFragment === null)
  if (showMe && !out.some(s => s.item.kind === 'me')) out.unshift({ insertText: '@me ', item: { kind: 'me', name: '' } })
  if (
    nameFragment !== null &&
    nameFragment.length > 0 &&
    CREATABLE.has(kindFragment) &&
    !out.some(s => s.item.kind === kindFragment && s.item.name === nameFragment)
  )
    out.push({
      createNew: true,
      insertText: `@${kindFragment}:${nameFragment} `,
      item: { kind: kindFragment, name: nameFragment }
    })
  return out
}
const groupByKind = (suggestions: Suggestion[]): { kind: string; rows: Suggestion[] }[] => {
  const groups = new Map<string, Suggestion[]>()
  for (const s of suggestions) {
    const arr = groups.get(s.item.kind) ?? []
    arr.push(s)
    groups.set(s.item.kind, arr)
  }
  return KIND_ORDER.filter(k => groups.has(k)).map(k => ({ kind: k, rows: groups.get(k) ?? [] }))
}
interface MentionAutocompleteProps {
  active: ActiveMention
  items: MentionItem[]
  onSelect: (insertText: string, item: MentionItem) => void
}
const MentionAutocomplete = ({ active, items, onSelect }: MentionAutocompleteProps) => {
  const suggestions = useMemo(() => buildSuggestions(items, active), [active, items])
  const groups = useMemo(() => groupByKind(suggestions), [suggestions])
  if (suggestions.length === 0)
    return <div className='text-xs text-muted-foreground p-3 rounded-md border bg-popover shadow-md'>No matches.</div>
  return (
    <div className='max-h-80 overflow-auto rounded-md border bg-popover shadow-md text-xs min-w-[280px]'>
      {groups.map(g => {
        const Icon = KIND_ICON[g.kind] ?? FolderOpen
        return (
          <div className='py-1' key={g.kind}>
            <div className='flex items-center gap-1.5 px-3 py-1 text-[0.65rem] uppercase text-muted-foreground tracking-wide'>
              <Icon className='size-3' /> {KIND_LABEL[g.kind] ?? g.kind}
            </div>
            {g.rows.map(s => (
              <button
                className='flex items-center gap-2 w-full px-3 py-1.5 hover:bg-accent text-left'
                key={s.insertText}
                onClick={() => onSelect(s.insertText, s.item)}
                type='button'>
                <Badge className={cn('font-mono text-[0.65rem]', KIND_TONES[s.item.kind] ?? '')} variant='outline'>
                  {s.item.kind === 'me' ? '@me' : `@${s.item.kind}:${s.item.name}`}
                </Badge>
                {s.createNew ? <span className='text-muted-foreground'>create</span> : null}
                {s.item.summary ? (
                  <span className='text-muted-foreground truncate flex-1 min-w-0'>{s.item.summary}</span>
                ) : null}
              </button>
            ))}
          </div>
        )
      })}
    </div>
  )
}
export { buildSuggestions, CREATABLE, fuzzy, KIND_ICON, KIND_LABEL, KIND_ORDER, MentionAutocomplete }
export type { MentionAutocompleteProps, MentionItem, Suggestion }
