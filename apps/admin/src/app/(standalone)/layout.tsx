'use client'
import type { ReactNode } from 'react'
import { GoogleSignInButton } from '@a/react/components'
import { Authenticated, AuthLoading, Unauthenticated } from 'convex/react'
import Link from 'next/link'
import { AdminSidebarNav } from '../../sidebar-nav'
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
      <aside className='sticky top-0 flex h-dvh w-56 shrink-0 flex-col gap-3 overflow-y-auto border-r p-3'>
        <Link className='font-semibold' href='/dashboard'>
          byerag admin
        </Link>
        <AdminSidebarNav />
      </aside>
      <main className='flex-1 overflow-auto'>{children}</main>
    </Authenticated>
  </div>
)
export default StandaloneLayout
