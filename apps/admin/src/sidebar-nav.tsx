'use client'
import type { LucideIcon } from 'lucide-react'
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
  { href: '/quarantine', icon: ShieldAlert, label: 'Quarantine' },
  { href: '/test-questions', icon: ClipboardList, label: 'Test questions' },
  { href: '/training', icon: GraduationCap, label: 'Training' },
  { href: '/users', icon: Users, label: 'Users' },
  { href: '/audit', icon: ScrollText, label: 'Audit' },
  { href: '/deleted', icon: Trash2, label: 'Trash' }
]
const AdminSidebarNav = (): React.ReactElement => (
  <nav className='flex flex-1 flex-col gap-1 border-b py-2 text-sm'>
    {LINKS.map(l => {
      const Icon = l.icon
      return (
        <Link className='flex items-center gap-2 rounded px-2 py-1 hover:bg-muted' href={l.href} key={l.href}>
          <Icon aria-hidden className='size-4 shrink-0 text-muted-foreground' />
          {l.label}
        </Link>
      )
    })}
  </nav>
)
export { AdminSidebarNav }
