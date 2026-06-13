/** biome-ignore-all lint/nursery/noUndeclaredClasses: standard tailwind v4 utilities biome cannot resolve */
/* eslint-disable @typescript-eslint/strict-void-return */
'use client'
import type { Id } from 'backend/convex/_generated/dataModel'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@a/ui/components/alert-dialog'
import { Button } from '@a/ui/components/button'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@a/ui/components/context-menu'
import { Input } from '@a/ui/components/input'
import { Loader2, Pencil, Star, StarOff, Trash } from 'lucide-react'
import { memo, useEffect, useRef, useState } from 'react'

interface Chat {
  _id: Id<'chats'>
  isBookmarked?: boolean
  streaming?: boolean
  title: string
  updatedAt: number
}
interface ChatItemProps {
  chat: Chat
  isActive: boolean
  onDelete: (chatId: Id<'chats'>) => void
  onRename: (chatId: Id<'chats'>, title: string) => Promise<void>
  onSelect: (chatId: Id<'chats'>) => void
  onToggleBookmark?: (chatId: Id<'chats'>, next: boolean) => void
  setOpenMobile: (open: boolean) => void
}
const ChatItemInner = ({
  chat,
  isActive,
  onDelete,
  onRename,
  onSelect,
  onToggleBookmark,
  setOpenMobile
}: ChatItemProps) => {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(chat.title)
  const [optimisticTitle, setOptimisticTitle] = useState<null | string>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const mountedRef = useRef(true)
  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])
  useEffect(
    () => () => {
      mountedRef.current = false
    },
    []
  )
  const streaming = chat.streaming === true
  const displayTitle = optimisticTitle && optimisticTitle !== chat.title ? optimisticTitle : chat.title
  const startRename = (): void => {
    setDraft(chat.title)
    setEditing(true)
  }
  const commit = async (): Promise<void> => {
    const trimmed = draft.trim()
    setEditing(false)
    if (!trimmed || trimmed === chat.title) return
    setOptimisticTitle(trimmed)
    try {
      await onRename(chat._id, trimmed)
      if (mountedRef.current) setOptimisticTitle(null)
    } catch {
      if (mountedRef.current) setOptimisticTitle(null)
    }
  }
  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger className='group/item relative flex items-center gap-2'>
          {editing ? (
            <Input
              aria-label={`Rename chat ${chat.title}`}
              className='h-8 w-full rounded-md border border-ring bg-background px-2 text-sm outline-none'
              onBlur={commit}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') commit()
                if (e.key === 'Escape') {
                  setDraft(chat.title)
                  setEditing(false)
                }
              }}
              ref={inputRef}
              value={draft}
            />
          ) : (
            <Button
              className='h-8 w-full justify-start truncate px-2'
              onClick={() => {
                setOpenMobile(false)
                onSelect(chat._id)
              }}
              title={streaming ? `${chat.title} — streaming…` : chat.title}
              variant={isActive ? 'secondary' : 'ghost'}>
              {streaming ? (
                <Loader2 aria-label='streaming' className='size-3 shrink-0 animate-spin text-muted-foreground' />
              ) : null}
              {chat.isBookmarked ? <Star aria-label='bookmarked' className='size-3 shrink-0 text-amber-500' /> : null}
              <span className='truncate'>{displayTitle}</span>
            </Button>
          )}
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem disabled={streaming} onClick={startRename}>
            <Pencil className='mr-2 size-4' />
            Rename
          </ContextMenuItem>
          {onToggleBookmark ? (
            <ContextMenuItem disabled={streaming} onClick={() => onToggleBookmark(chat._id, !chat.isBookmarked)}>
              {chat.isBookmarked ? <StarOff className='mr-2 size-4' /> : <Star className='mr-2 size-4' />}
              {chat.isBookmarked ? 'Unbookmark' : 'Bookmark'}
            </ContextMenuItem>
          ) : null}
          <ContextMenuItem disabled={streaming} onClick={() => setConfirmOpen(true)} variant='destructive'>
            <Trash className='mr-2 size-4' />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <AlertDialog onOpenChange={setConfirmOpen} open={confirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete chat?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{chat.title}&rdquo; will be removed. You have 5 minutes to undo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => onDelete(chat._id)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
const ChatItem = memo(
  ChatItemInner,
  (prev, next) =>
    prev.chat._id === next.chat._id &&
    prev.chat.title === next.chat.title &&
    prev.chat.streaming === next.chat.streaming &&
    prev.chat.updatedAt === next.chat.updatedAt &&
    prev.chat.isBookmarked === next.chat.isBookmarked &&
    prev.isActive === next.isActive &&
    prev.onDelete === next.onDelete &&
    prev.onRename === next.onRename &&
    prev.onSelect === next.onSelect &&
    prev.onToggleBookmark === next.onToggleBookmark &&
    prev.setOpenMobile === next.setOpenMobile
)
export { ChatItem }
export type { Chat }
