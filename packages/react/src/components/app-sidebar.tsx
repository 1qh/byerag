/** biome-ignore-all lint/nursery/noUndeclaredClasses: standard tailwind v4 utilities biome cannot resolve */
'use client'
import type { Id } from 'backend/convex/_generated/dataModel'
import type { ReactNode } from 'react'
import { cn } from '@a/ui'
import { Button } from '@a/ui/components/button'
import {
  Sidebar,
  SidebarContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar
} from '@a/ui/components/sidebar'
import { api } from 'backend/convex/_generated/api'
import { useConvexAuth, useQuery } from 'convex/react'
import { PanelLeft, SquarePen } from 'lucide-react'
import { Roboto_Serif } from 'next/font/google'
import { SidebarHistory } from './sidebar-history'
import { SidebarUserNav } from './sidebar-user-nav'

const robotoSerifText = Roboto_Serif({ display: 'swap', subsets: ['latin'], weight: '400' })
interface AppSidebarProps {
  activeChatId: Id<'chats'> | null
  onNewChat: () => void
  onSelect: (id: Id<'chats'>) => void
  slotAboveHistory?: ReactNode
  slotBelowHistory?: ReactNode
  title?: string
}
const ConnectionDot = () => {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const connected = isAuthenticated && !isLoading
  return (
    <output
      aria-label={connected ? 'Connected to server' : 'Connecting to server'}
      className={cn('inline-block size-1.5 rounded-full', connected ? 'bg-green-500' : 'bg-yellow-500 animate-pulse')}
      title={connected ? 'Connected' : 'Connecting'}
    />
  )
}
const AppSidebar = ({
  activeChatId,
  onNewChat,
  onSelect,
  slotAboveHistory,
  slotBelowHistory,
  title = 'agent'
}: AppSidebarProps) => {
  const { toggleSidebar } = useSidebar()
  const user = useQuery(api.chats.currentUser, {})
  if (!user) return null
  return (
    <Sidebar className='border-none' collapsible='icon'>
      <SidebarHeader className='flex-row items-center'>
        {/* Expanded: single button with icon + title that morphs to 'New chat' on hover */}
        <Button
          aria-label='new chat'
          className='group/logo flex-1 h-8 px-2 justify-start gap-2 group-data-[collapsible=icon]:hidden relative'
          onClick={onNewChat}
          title='new chat (⌘N)'
          type='button'
          variant='ghost'>
          <SquarePen className='size-5 shrink-0 absolute left-2 opacity-0 -translate-x-1 group-hover/logo:opacity-100 group-hover/logo:translate-x-0 transition-all duration-200' />
          <span
            className={cn(
              robotoSerifText.className,
              'relative block whitespace-nowrap text-xl font-semibold tracking-tight transition-transform duration-200 group-hover/logo:translate-x-7'
            )}>
            <span className='block transition-opacity duration-200 group-hover/logo:opacity-0'>{title}</span>
          </span>
          <span
            className={cn(
              robotoSerifText.className,
              'absolute left-9 whitespace-nowrap text-xl font-semibold tracking-tight opacity-0 transition-opacity duration-200 group-hover/logo:opacity-100'
            )}>
            new chat
          </span>
        </Button>
        {/* Collapsed: expand button */}
        <Button
          aria-label='Expand sidebar'
          className='size-8 p-2 hidden group-data-[collapsible=icon]:flex'
          onClick={toggleSidebar}
          title='Expand sidebar'
          type='button'
          variant='ghost'>
          <PanelLeft className='size-5' />
        </Button>
        <ConnectionDot />
        <Button
          aria-label='Collapse sidebar'
          className='size-8 p-0 group-data-[collapsible=icon]:hidden'
          onClick={toggleSidebar}
          title='Collapse sidebar'
          type='button'
          variant='ghost'>
          <PanelLeft className='size-5' />
        </Button>
      </SidebarHeader>
      <SidebarContent className='gap-0 p-1 group-data-[collapsible=icon]:p-2'>
        <SidebarMenu className='hidden group-data-[collapsible=icon]:block'>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onNewChat} tooltip='New chat (⌘N)'>
              <SquarePen />
              <span>New chat</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        {slotAboveHistory}
        <SidebarSeparator />
        <SidebarGroupLabel>Chats</SidebarGroupLabel>
        <SidebarHistory activeChatId={activeChatId} onSelect={onSelect} />
        {slotBelowHistory}
      </SidebarContent>
      <SidebarUserNav user={user} />
    </Sidebar>
  )
}
export { AppSidebar }
