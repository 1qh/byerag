'use client'
import type { ReactNode } from 'react'
import { createContext, use, useCallback, useMemo, useState } from 'react'
const GROUP_WINDOW_MS = 500
interface DraftedLine {
  addedAt: number
  id: string
  text: string
}
interface PaneState {
  appendDraft: (line: string) => void
  clearDrafts: () => void
  closePane: () => void
  draftAppender: ((line: string) => void) | null
  draftedLines: DraftedLine[]
  openSubject: (subject: PaneSubject) => void
  registerDraftAppender: (fn: (line: string) => void) => () => void
  removeDraft: (id: string) => void
  subject: null | PaneSubject
}
interface PaneSubject {
  breadcrumb: string
  kind: string
  payload: unknown
}
const PaneContext = createContext<null | PaneState>(null)
const PaneProvider = ({ children }: { children: ReactNode }) => {
  const [subject, setSubject] = useState<null | PaneSubject>(null)
  const [drafted, setDrafted] = useState<DraftedLine[]>([])
  const [appender, setAppender] = useState<((line: string) => void) | null>(null)
  const openSubject = useCallback((next: PaneSubject) => setSubject(next), [])
  const closePane = useCallback(() => setSubject(null), [])
  const appendDraft = useCallback((line: string) => {
    const trimmed = line.trim()
    if (!trimmed) return
    const now = Date.now()
    setDrafted(prev => {
      const last = prev.at(-1)
      if (last && now - last.addedAt < GROUP_WINDOW_MS)
        return [...prev.slice(0, -1), { ...last, addedAt: now, text: `${last.text}\n${trimmed}` }]
      return [...prev, { addedAt: now, id: `${now}-${prev.length}`, text: trimmed }]
    })
  }, [])
  const removeDraft = useCallback((id: string) => {
    setDrafted(prev => prev.filter(d => d.id !== id))
  }, [])
  const clearDrafts = useCallback(() => setDrafted([]), [])
  const registerDraftAppender = useCallback((fn: (line: string) => void) => {
    setAppender(() => fn)
    return () => setAppender(null)
  }, [])
  const value = useMemo<PaneState>(
    () => ({
      appendDraft,
      clearDrafts,
      closePane,
      draftAppender: appender,
      draftedLines: drafted,
      openSubject,
      registerDraftAppender,
      removeDraft,
      subject
    }),
    [appendDraft, appender, clearDrafts, closePane, drafted, openSubject, registerDraftAppender, removeDraft, subject]
  )
  return <PaneContext value={value}>{children}</PaneContext>
}
const usePane = (): PaneState => {
  const ctx = use(PaneContext)
  if (!ctx) throw new Error('usePane must be used inside <PaneProvider>')
  return ctx
}
const usePaneOptional = (): null | PaneState => use(PaneContext)
export { GROUP_WINDOW_MS, PaneProvider, usePane, usePaneOptional }
export type { DraftedLine, PaneState, PaneSubject }
