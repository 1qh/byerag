/** biome-ignore-all lint/nursery/noUndeclaredClasses: standard tailwind v4 utilities biome cannot resolve */
'use client'
import type { Id } from 'backend/convex/_generated/dataModel'
import type { ComponentType, ReactNode } from 'react'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@a/ui/components/sidebar'
import { api } from 'backend/convex/_generated/api'
import { useConvexAuth, useQuery } from 'convex/react'
import { useParams, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { AppSidebar, Chat, CommandPalette, DocSheet, ShortcutModal, useBusyState } from '../components'
import { useFileUploadCtx } from '../components/composer-extras-context'
import { useMentionItemsCtx } from '../components/mention-items-context'
import { useStarterPromptsCtx } from '../components/starter-prompts-context'
import { useChatList, useShortcuts, useStreamingTitle } from '../lib'

interface ChatWithBusyStateProps {
  activeChatId: Id<'chats'> | null
  dynamicPrompts: readonly string[] | undefined
  inputPlaceholder?: string
  mentionItems: ReturnType<typeof useMentionItemsCtx>
  onFileUpload: ReturnType<typeof useFileUploadCtx>
  prompts: readonly string[] | undefined
}
interface DefaultMainLayoutProps {
  children: ReactNode
  inputPlaceholder?: string
  LoginScreen: ComponentType
  paneSlot?: ReactNode
  prompts?: readonly string[]
  sidebarSlotAboveHistory?: ReactNode
  sidebarSlotBelowHistory?: ReactNode
  title?: string
}
const ChatWithBusyState = ({
  activeChatId,
  dynamicPrompts,
  inputPlaceholder,
  mentionItems,
  onFileUpload,
  prompts
}: ChatWithBusyStateProps) => {
  const busy = useBusyState()
  return (
    <Chat
      chatId={activeChatId}
      inputPlaceholder={inputPlaceholder}
      lockedReason={busy.lockedReason}
      mentionItems={mentionItems}
      onFileUpload={onFileUpload}
      onStop={busy.onStop ?? undefined}
      prompts={dynamicPrompts ?? prompts}
    />
  )
}
const DefaultMainLayout = ({
  LoginScreen,
  children,
  inputPlaceholder,
  paneSlot,
  prompts,
  sidebarSlotAboveHistory,
  sidebarSlotBelowHistory,
  title
}: DefaultMainLayoutProps) => {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const router = useRouter()
  const params = useParams<{ id?: string }>()
  const activeChatId = (params.id ?? null) as Id<'chats'> | null
  const chats = useChatList()
  const chatStatus = useQuery(api.chats.status, activeChatId ? { chatId: activeChatId } : 'skip')
  const mentionItems = useMentionItemsCtx()
  const onFileUpload = useFileUploadCtx()
  const dynamicPrompts = useStarterPromptsCtx()
  const onNewChat = (): void => router.push('/')
  const onSelect = (id: Id<'chats'>): void => router.push(`/chat/${id}`)
  const navigate = (dir: -1 | 1): void => {
    const list = chats ?? []
    if (list.length === 0) return
    const sorted = [...list].toSorted((a, b) => b.updatedAt - a.updatedAt)
    const idx = sorted.findIndex(c => c._id === activeChatId)
    const nextIdx = idx === -1 ? 0 : (idx + dir + sorted.length) % sorted.length
    const next = sorted[nextIdx]
    if (next) onSelect(next._id)
  }
  useShortcuts({ newChat: onNewChat, nextChat: () => navigate(1), prevChat: () => navigate(-1) })
  useStreamingTitle()
  useEffect(() => {
    if (!activeChatId) return
    if (chatStatus === undefined) return
    if (chatStatus.title !== '') return
    router.replace('/')
  }, [activeChatId, chatStatus, router])
  if (isLoading) return <div className='flex h-dvh items-center justify-center text-muted-foreground'>Loading…</div>
  if (!isAuthenticated) return <LoginScreen />
  return (
    <SidebarProvider>
      <AppSidebar
        activeChatId={activeChatId}
        onNewChat={onNewChat}
        onSelect={onSelect}
        slotAboveHistory={sidebarSlotAboveHistory}
        slotBelowHistory={sidebarSlotBelowHistory}
        title={title}
      />
      <SidebarInset className='relative flex min-w-0 flex-col'>
        <SidebarTrigger className='absolute top-2 left-2 z-20 md:hidden' />
        <ChatWithBusyState
          activeChatId={activeChatId}
          dynamicPrompts={dynamicPrompts}
          inputPlaceholder={inputPlaceholder}
          mentionItems={mentionItems}
          onFileUpload={onFileUpload}
          prompts={prompts}
        />
        {children}
      </SidebarInset>
      {paneSlot}
      <CommandPalette onCreate={onNewChat} onSelect={onSelect} />
      <ShortcutModal />
      <DocSheet />
    </SidebarProvider>
  )
}
export { DefaultMainLayout }
