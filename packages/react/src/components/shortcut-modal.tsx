'use client'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@a/ui/components/dialog'
import { Fragment, useEffect, useState } from 'react'

const SHORTCUTS: [string, string][] = [
  ['⌘ N', 'New chat'],
  ['⌘ K', 'Open command palette'],
  ['⌘ [', 'Previous chat'],
  ['⌘ ]', 'Next chat'],
  ['⌘ .', 'Toggle debug/clean view'],
  ['?', 'Show this help'],
  ['Esc', 'Close dialogs']
]
const ShortcutModal = () => {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const { target } = e
      const editable =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.closest('[cmdk-input-wrapper]') !== null ||
          target.getAttribute('cmdk-input') !== null)
      if (editable) return
      if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        setOpen(o => !o)
      }
    }
    globalThis.window.addEventListener('keydown', onKey)
    return () => globalThis.window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogContent className='max-w-sm'>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Press <kbd className='rounded bg-muted px-1 font-mono text-xs'>?</kbd> anywhere to toggle this.
          </DialogDescription>
        </DialogHeader>
        <dl className='grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm'>
          {SHORTCUTS.map(([key, desc]) => (
            <Fragment key={key}>
              <dt>
                <kbd className='rounded border bg-muted px-2 py-0.5 font-mono text-xs'>{key}</kbd>
              </dt>
              <dd className='text-muted-foreground'>{desc}</dd>
            </Fragment>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  )
}
export { ShortcutModal }
