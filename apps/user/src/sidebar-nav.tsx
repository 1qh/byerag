'use client'
import { Badge } from '@a/ui/components/badge'
import { api } from 'backend/convex/_generated/api'
import { useQuery } from 'convex/react'
import Link from 'next/link'
const UserSidebarNav = (): React.ReactElement => {
  const assignments = useQuery(api.trainingAssignments.myActiveAssignments)
  const topics = useQuery(api.training.listMyTopics)
  const passedAssigned = new Set((topics ?? []).filter(t => t.myStatus === 'passed-assigned').map(t => t._id))
  const pending = (assignments ?? []).filter(a => !passedAssigned.has(a.topicId)).length
  return (
    <nav className='flex flex-1 flex-col gap-1 border-b py-2 text-sm'>
      <Link className='rounded px-2 py-1 hover:bg-muted' href='/'>
        Chat
      </Link>
      <Link className='flex items-center justify-between rounded px-2 py-1 hover:bg-muted' href='/training'>
        <span>Training</span>
        {pending > 0 ? <Badge variant='destructive'>{pending}</Badge> : null}
      </Link>
      <Link className='rounded px-2 py-1 hover:bg-muted' href='/docs'>
        Docs
      </Link>
    </nav>
  )
}
export { UserSidebarNav }
