'use client'
import type { Id } from 'backend/convex/_generated/dataModel'
import { useApp } from '@a/react/app-context'
import { useVerbosity } from '@a/react/lib'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@a/ui/components/command'
import { api } from 'backend/convex/_generated/api'
import { useQuery } from 'convex/react'
import { CheckIcon, EyeIcon, MessageSquareIcon, PlusIcon, SunMoonIcon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

interface Props {
  onCreate: () => void
  onSelect: (id: Id<'chats'>) => void
}
const currentMark = (cond: boolean) => (cond ? <CheckIcon className='ml-auto size-3 text-muted-foreground' /> : null)
const CommandPalette = ({ onCreate, onSelect }: Props) => {
  const [open, setOpen] = useState(false)
  const { id: app } = useApp()
  const chats = useQuery(api.chats.list, open ? { app } : 'skip')
  const { mode, toggle } = useVerbosity()
  const { setTheme, theme } = useTheme()
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
    }
    globalThis.window.addEventListener('keydown', onKey)
    return () => globalThis.window.removeEventListener('keydown', onKey)
  }, [])
  const run = (fn: () => void): void => {
    fn()
    setOpen(false)
  }
  return (
    <CommandDialog onOpenChange={setOpen} open={open}>
      <CommandInput placeholder='Command or search chat…' />
      <CommandList>
        <CommandEmpty>No results</CommandEmpty>
        <CommandGroup heading='Actions'>
          <CommandItem onSelect={() => run(onCreate)}>
            <PlusIcon />
            <span>New chat</span>
          </CommandItem>
          <CommandItem onSelect={() => run(toggle)}>
            <EyeIcon />
            <span>Switch to {mode === 'debug' ? 'clean' : 'debug'} view</span>
            <span className='ml-auto text-xs text-muted-foreground'>current: {mode}</span>
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading='Theme'>
          <CommandItem onSelect={() => run(() => setTheme('light'))}>
            <SunMoonIcon />
            <span>Light</span>
            {currentMark(theme === 'light')}
          </CommandItem>
          <CommandItem onSelect={() => run(() => setTheme('dark'))}>
            <SunMoonIcon />
            <span>Dark</span>
            {currentMark(theme === 'dark')}
          </CommandItem>
          <CommandItem onSelect={() => run(() => setTheme('system'))}>
            <SunMoonIcon />
            <span>System</span>
            {currentMark(theme === 'system')}
          </CommandItem>
        </CommandGroup>
        {chats && chats.length > 0 ? (
          <CommandGroup heading='Chats'>
            {chats.map(c => (
              <CommandItem key={c._id} onSelect={() => run(() => onSelect(c._id))}>
                <MessageSquareIcon />
                <span className='truncate'>{c.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
  )
}
export { CommandPalette }
