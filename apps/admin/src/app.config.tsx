import { defineApp } from '@a/react/next/define-app'
import { AdminSidebarNav } from './sidebar-nav'

const { MainLayout, Providers, RootLayout, metadata } = defineApp({
  appId: 'admin',
  sidebarSlotAboveHistory: <AdminSidebarNav />
})
export { MainLayout, metadata, Providers, RootLayout }
