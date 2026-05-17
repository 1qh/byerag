import { defineApp } from '@a/react/next/define-app'
import { UserSidebarNav } from './sidebar-nav'
const { MainLayout, Providers, RootLayout, metadata } = defineApp({
  appId: 'user',
  sidebarSlotAboveHistory: <UserSidebarNav />
})
export { MainLayout, metadata, Providers, RootLayout }
