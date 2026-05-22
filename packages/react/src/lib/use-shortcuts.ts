'use client'
import { useEffect } from 'react'

interface Handlers {
  newChat?: () => void
  nextChat?: () => void
  prevChat?: () => void
}
const isEditable = (el: EventTarget | null): boolean => {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
}
const useShortcuts = ({ newChat, nextChat, prevChat }: Handlers): void => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (isEditable(e.target) && (e.key === '[' || e.key === ']')) return
      if (e.key === 'n' || e.key === 'N') {
        if (isEditable(e.target)) return
        e.preventDefault()
        newChat?.()
        return
      }
      if (e.key === '[') {
        e.preventDefault()
        prevChat?.()
        return
      }
      if (e.key === ']') {
        e.preventDefault()
        nextChat?.()
      }
    }
    globalThis.window.addEventListener('keydown', onKey)
    return () => globalThis.window.removeEventListener('keydown', onKey)
  }, [newChat, prevChat, nextChat])
}
export { useShortcuts }
