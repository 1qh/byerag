/** biome-ignore-all lint/nursery/noUndeclaredClasses: standard tailwind v4 utilities biome cannot resolve */
/* oxlint-disable react-perf/jsx-no-jsx-as-prop */
'use client'
import type { LucideIcon } from 'lucide-react'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@a/ui/components/sidebar'
import {
  ClipboardList,
  FileText,
  GraduationCap,
  LayoutDashboard,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Users
} from 'lucide-react'
import Link from 'next/link'

const LINKS: { href: string; icon: LucideIcon; label: string }[] = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/docs', icon: FileText, label: 'Docs' },
  { href: '/policy', icon: ShieldCheck, label: 'Policy' },
  { href: '/quarantine', icon: ShieldAlert, label: 'Blocked uploads' },
  { href: '/test-questions', icon: ClipboardList, label: 'Question bank' },
  { href: '/training', icon: GraduationCap, label: 'Training' },
  { href: '/users', icon: Users, label: 'Accounts' },
  { href: '/audit', icon: ScrollText, label: 'Activity log' },
  { href: '/deleted', icon: Trash2, label: 'Trash' }
]
const AdminSidebarNav = (): React.ReactElement => (
  <SidebarMenu className='border-b pb-2'>
    {LINKS.map(l => {
      const Icon = l.icon
      return (
        <SidebarMenuItem key={l.href}>
          <SidebarMenuButton
            render={
              <Link href={l.href}>
                <Icon aria-hidden />
                <span>{l.label}</span>
              </Link>
            }
            tooltip={l.label}
          />
        </SidebarMenuItem>
      )
    })}
  </SidebarMenu>
)
export { AdminSidebarNav }
