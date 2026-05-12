'use client'
import { Button } from '@a/ui/components/button'
import { useSidebar } from '@a/ui/components/sidebar'
import { Menu } from 'lucide-react'
import { memo, useEffect } from 'react'
interface ChatHeaderProps {
  chatId: string
}
const PureChatHeader = ({ chatId }: ChatHeaderProps) => {
  const { isMobile, setOpenMobile, toggleSidebar } = useSidebar()
  useEffect(() => {
    if (chatId) setOpenMobile(false)
  }, [chatId, setOpenMobile])
  if (!isMobile) return null
  return (
    <header className='absolute inset-x-0 top-1 z-1 flex items-center pr-1'>
      <Button onClick={toggleSidebar} size='icon' title='Open menu' variant='ghost'>
        <Menu className='size-5' />
      </Button>
    </header>
  )
}
const ChatHeader = memo(PureChatHeader, (prev, next) => prev.chatId === next.chatId)
export { ChatHeader }
