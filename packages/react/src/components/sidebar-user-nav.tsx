/* eslint-disable @typescript-eslint/strict-void-return */
'use client'
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
import { Avatar, AvatarFallback, AvatarImage } from '@a/ui/components/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@a/ui/components/dropdown-menu'
import { useAuthActions } from '@convex-dev/auth/react'
import { Check, LogOut, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useState } from 'react'

interface SidebarUserNavProps {
  user: User
}
interface User {
  email?: null | string
  image?: null | string
  name?: null | string
}
const initialsOf = (name?: null | string): string => {
  if (!name) return '?'
  return name
    .split(' ')
    .map(p => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}
const SidebarUserNav = ({ user }: SidebarUserNavProps) => {
  const { signOut } = useAuthActions()
  const { resolvedTheme, setTheme } = useTheme()
  const [showLogoutDialog, setShowLogoutDialog] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const displayName = user.name ?? user.email ?? 'User'
  const handleLogout = async (): Promise<void> => {
    setIsLoggingOut(true)
    await signOut()
    setShowLogoutDialog(false)
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className='flex items-center p-1.5 hover:bg-muted'>
          <Avatar className='size-8.5 max-w-8.5 shrink-0'>
            <AvatarImage alt={displayName} src={user.image ?? undefined} />
            <AvatarFallback className='text-sm font-medium group-data-[collapsible=icon]:text-xs'>
              {initialsOf(user.name)}
            </AvatarFallback>
          </Avatar>
          <div className='ml-1 flex min-w-0 flex-1 flex-col items-start gap-1 truncate text-left group-data-[collapsible=icon]:hidden'>
            <span className='w-full text-sm leading-none font-medium'>{displayName}</span>
            {user.email ? (
              <span className='text-xs leading-none font-medium text-muted-foreground'>{user.email}</span>
            ) : null}
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='w-fit' side='right' sideOffset={8}>
          <DropdownMenuItem onClick={() => setTheme('light')}>
            <Sun />
            Light
            {resolvedTheme === 'light' ? <Check className='ml-auto' /> : null}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme('dark')}>
            <Moon />
            Dark
            {resolvedTheme === 'dark' ? <Check className='ml-auto' /> : null}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowLogoutDialog(true)}>
            <LogOut />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog onOpenChange={setShowLogoutDialog} open={showLogoutDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out?</AlertDialogTitle>
            <AlertDialogDescription>You will be signed out of {user.email ?? 'this account'}.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={isLoggingOut} onClick={handleLogout}>
              {isLoggingOut ? 'Logging out…' : 'Log out'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
export { SidebarUserNav }
