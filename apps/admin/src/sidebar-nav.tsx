'use client'
import Link from 'next/link'
const LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/docs', label: 'Docs' },
  { href: '/policy', label: 'Policy' },
  { href: '/quarantine', label: 'Quarantine' },
  { href: '/test-questions', label: 'Test questions' },
  { href: '/training', label: 'Training' },
  { href: '/users', label: 'Users' },
  { href: '/audit', label: 'Audit' }
]
const AdminSidebarNav = (): React.ReactElement => (
  <nav className='flex flex-1 flex-col gap-1 border-b py-2 text-sm'>
    {LINKS.map(l => (
      <Link className='rounded px-2 py-1 hover:bg-muted' href={l.href} key={l.href}>
        {l.label}
      </Link>
    ))}
  </nav>
)
export { AdminSidebarNav }
