'use client'
import type { ReactNode } from 'react'
import { createContext, use, useCallback, useMemo, useState } from 'react'

interface DocSheetApi extends DocSheetState {
  close: () => void
  openDoc: (docId: string, anchor?: null | string) => void
}
interface DocSheetState {
  anchor: null | string
  docId: null | string
}
const DocSheetContext = createContext<DocSheetApi>({
  anchor: null,
  close: () => {
    /* Empty */
  },
  docId: null,
  openDoc: () => {
    /* Empty */
  }
})
const DocSheetProvider = ({ children }: { children: ReactNode }): React.ReactElement => {
  const [state, setState] = useState<DocSheetState>({ anchor: null, docId: null })
  const openDoc = useCallback((docId: string, anchor: null | string = null) => {
    setState({ anchor, docId })
  }, [])
  const close = useCallback(() => {
    setState({ anchor: null, docId: null })
  }, [])
  const value = useMemo<DocSheetApi>(
    () => ({ anchor: state.anchor, close, docId: state.docId, openDoc }),
    [state.anchor, state.docId, close, openDoc]
  )
  return <DocSheetContext value={value}>{children}</DocSheetContext>
}
const useDocSheet = (): DocSheetApi => use(DocSheetContext)
export { DocSheetProvider, useDocSheet }
