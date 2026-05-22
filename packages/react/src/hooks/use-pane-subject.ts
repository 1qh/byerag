'use client'
import { useEffect } from 'react'
import { usePane } from '../components/pane/pane-context'

const usePaneSubject = (kind: null | string, breadcrumb: string, payload: unknown): void => {
  const { openSubject } = usePane()
  useEffect(() => {
    if (kind) openSubject({ breadcrumb, kind, payload })
  }, [breadcrumb, kind, openSubject, payload])
}
export { usePaneSubject }
