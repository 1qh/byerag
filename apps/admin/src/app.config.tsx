import { defineApp } from '@a/react/next/define-app'
import { AdminSidebarNav } from './sidebar-nav'

const { MainLayout, Providers, RootLayout, metadata } = defineApp({
  appId: 'admin',
  prompts: [
    'What docs are in the corpus this week?',
    'Which uploads got rejected today and why?',
    'Who has overdue tests?',
    'Summarize the most-asked topics from the team this month.'
  ],
  sidebarSlotAboveHistory: <AdminSidebarNav />
})
export { MainLayout, metadata, Providers, RootLayout }
