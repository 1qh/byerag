import { defineApp } from '@a/react/next/define-app'
import { UserSidebarNav } from './sidebar-nav'

const { MainLayout, Providers, RootLayout, metadata } = defineApp({
  appId: 'user',
  prompts: [
    'Summarize the latest shared docs in plain language.',
    'What does our policy say about working hours?',
    'Compare any two shared documents I should know about.',
    'What tests do I still need to take?'
  ],
  sidebarSlotAboveHistory: <UserSidebarNav />
})
export { MainLayout, metadata, Providers, RootLayout }
