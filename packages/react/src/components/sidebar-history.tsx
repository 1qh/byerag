/* oxlint-disable promise/prefer-await-to-then, promise/prefer-await-to-callbacks */
'use client'
import type { Id } from 'backend/convex/_generated/dataModel'
import { useApp } from '@a/react/app-context'
import { errorMessage, groupByTime, useChatList, useNow } from '@a/react/lib'
import { useSidebar } from '@a/ui/components/sidebar'
import { Spinner } from '@a/ui/components/spinner'
import { api } from 'backend/convex/_generated/api'
import { useMutation } from 'convex/react'
import { Fragment, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { ChatItem } from './sidebar-history-item'

interface SidebarHistoryProps {
  activeChatId: Id<'chats'> | null
  onSelect: (id: Id<'chats'>) => void
}
const SectionHeader = ({ label }: { label: string }) => (
  <p className='px-2 py-1 pt-4 text-sm font-medium text-muted-foreground'>{label}</p>
)
const SidebarHistory = ({ activeChatId, onSelect }: SidebarHistoryProps) => {
  const { id: app } = useApp()
  const { isMobile, setOpenMobile, state } = useSidebar()
  const chatsRaw = useChatList()
  const remove = useMutation(api.chats.remove)
  const restore = useMutation(api.chats.restore)
  const rename = useMutation(api.chats.updateTitle)
  const toggleBookmark = useMutation(api.chats.toggleBookmark)
  const now = useNow()
  const onDelete = useCallback(
    (id: Id<'chats'>): void => {
      const run = async (): Promise<void> => {
        try {
          await remove({ app, chatId: id })
          toast('Chat deleted', {
            action: {
              label: 'Undo',
              onClick: () => {
                restore({ app, chatId: id }).catch((error: unknown) => toast.error(errorMessage(error)))
              }
            },
            duration: 10_000
          })
        } catch (error: unknown) {
          toast.error(errorMessage(error))
        }
      }
      run().catch(() => {
        /* Empty */
      })
    },
    [app, remove, restore]
  )
  const onRename = useCallback(
    async (id: Id<'chats'>, title: string): Promise<void> => {
      try {
        await rename({ app, chatId: id, title })
      } catch (error: unknown) {
        toast.error(errorMessage(error))
        throw error
      }
    },
    [app, rename]
  )
  const onToggleBookmark = useCallback(
    (id: Id<'chats'>, next: boolean): void => {
      toggleBookmark({ app, chatId: id, next }).catch((error: unknown) => toast.error(errorMessage(error)))
    },
    [app, toggleBookmark]
  )
  const groups = useMemo(() => (chatsRaw ? groupByTime(chatsRaw, now) : []), [chatsRaw, now])
  if (chatsRaw === undefined) return <Spinner className='m-auto' />
  if (state !== 'collapsed' && chatsRaw.length === 0)
    return <p className='m-auto text-center text-sm text-muted-foreground'>No chats yet</p>
  if (state === 'collapsed' && !isMobile) return null
  return (
    <>
      {groups.map(g => (
        <Fragment key={g.label}>
          <SectionHeader label={g.label} />
          {g.chats.map(chat => (
            <ChatItem
              chat={chat}
              isActive={chat._id === activeChatId}
              key={chat._id}
              onDelete={onDelete}
              onRename={onRename}
              onSelect={onSelect}
              onToggleBookmark={onToggleBookmark}
              setOpenMobile={setOpenMobile}
            />
          ))}
        </Fragment>
      ))}
    </>
  )
}
export { SidebarHistory }
