'use client'
import { useCallback } from 'react'
import { usePane } from '../components/pane/pane-context'

interface ComposerDraftApi {
  append: (line: string) => void
}
const useComposerDraft = (): ComposerDraftApi => {
  const { appendDraft } = usePane()
  const append = useCallback((line: string) => appendDraft(line), [appendDraft])
  return { append }
}
export { useComposerDraft }
export type { ComposerDraftApi }
