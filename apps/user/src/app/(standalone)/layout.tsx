'use client'
import type { ReactNode } from 'react'
import { DocSheet, GoogleSignInButton, SidebarUserNav } from '@a/react/components'
import { cn } from '@a/ui'
import { api } from 'backend/convex/_generated/api'
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from 'convex/react'
import { Source_Serif_4 } from 'next/font/google'
import Link from 'next/link'
import { UserSidebarNav } from '../../sidebar-nav'
const brandFont = Source_Serif_4({ subsets: ['vietnamese'] })
const SidebarAccount = (): null | React.ReactElement => {
  const user = useQuery(api.chats.currentUser, {})
  return user ? <SidebarUserNav user={user} /> : null
}
const StandaloneLayout = ({ children }: { children: ReactNode }): React.ReactElement => (
  <div className='flex h-dvh'>
    <AuthLoading>
      <div className='grid flex-1 place-items-center'>Loading…</div>
    </AuthLoading>
    <Unauthenticated>
      <div className='grid flex-1 place-items-center'>
        <GoogleSignInButton />
      </div>
    </Unauthenticated>
    <Authenticated>
      <aside className='sticky top-0 flex h-dvh w-64 shrink-0 flex-col gap-3 overflow-y-auto border-sidebar-border border-r bg-sidebar p-3 text-sidebar-foreground'>
        <Link className={cn(brandFont.className, 'font-semibold text-2xl tracking-tighter')} href='/'>
          agent
        </Link>
        <UserSidebarNav />
        <SidebarAccount />
      </aside>
      <main className='flex-1 overflow-auto'>{children}</main>
      <DocSheet />
    </Authenticated>
  </div>
)
export default StandaloneLayout
