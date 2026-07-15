'use client'
import type { ReactNode } from 'react'
import { createContext, use, useCallback, useEffect, useMemo, useState } from 'react'

interface Ctx {
  mode: Mode
  toggle: () => void
}
type Mode = 'clean' | 'debug'
const VerbosityContext = createContext<Ctx | null>(null)
VerbosityContext.displayName = 'VerbosityContext'
const KEY = 'verbosity-mode'
const readInitial = (): Mode => {
  try {
    return globalThis.localStorage.getItem(KEY) === 'debug' ? 'debug' : 'clean'
  } catch {
    return 'clean'
  }
}
const VerbosityProvider = ({ children }: { children: ReactNode }) => {
  const [mode, setMode] = useState<Mode>(readInitial)
  useEffect(() => {
    globalThis.document.documentElement.dataset.verbosity = mode
    try {
      globalThis.localStorage.setItem(KEY, mode)
    } catch {
      /* No storage */
    }
  }, [mode])
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        const t = e.target
        const editable =
          t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
        if (editable) return
        e.preventDefault()
        setMode(m => (m === 'clean' ? 'debug' : 'clean'))
      }
    }
    globalThis.window.addEventListener('keydown', onKey)
    return () => globalThis.window.removeEventListener('keydown', onKey)
  }, [])
  const toggle = useCallback(() => setMode(m => (m === 'clean' ? 'debug' : 'clean')), [])
  const value = useMemo(() => ({ mode, toggle }), [mode, toggle])
  return <VerbosityContext value={value}>{children}</VerbosityContext>
}
const useVerbosity = (): Ctx => {
  const ctx = use(VerbosityContext)
  if (!ctx) throw new Error('useVerbosity outside VerbosityProvider')
  return ctx
}
export { useVerbosity, VerbosityProvider }
export type { Mode }
