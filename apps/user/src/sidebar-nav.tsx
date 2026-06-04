/* oxlint-disable react-perf/jsx-no-jsx-as-prop -- base-ui render prop pattern requires inline JSX; component memoized internally */
'use client'
import { Badge } from '@a/ui/components/badge'
import { SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem } from '@a/ui/components/sidebar'
import { api } from 'backend/convex/_generated/api'
import { useQuery } from 'convex/react'
import { FileText, GraduationCap, MessageSquare } from 'lucide-react'
import Link from 'next/link'

const UserSidebarNav = (): React.ReactElement => {
  const assignments = useQuery(api.trainingAssignments.myActiveAssignments)
  const topics = useQuery(api.training.listMyTopics)
  const passedAssigned = new Set((topics ?? []).filter(t => t.myStatus === 'passed-assigned').map(t => t._id))
  const pending = (assignments ?? []).filter(a => !passedAssigned.has(a.topicId)).length
  return (
    <SidebarMenu className='border-b pb-2'>
      <SidebarMenuItem>
        <SidebarMenuButton
          render={
            <Link href='/'>
              <MessageSquare aria-hidden />
              <span>Chat</span>
            </Link>
          }
          tooltip='Chat'
        />
      </SidebarMenuItem>
      <SidebarMenuItem>
        <SidebarMenuButton
          render={
            <Link href='/training'>
              <GraduationCap aria-hidden />
              <span>Training</span>
            </Link>
          }
          tooltip='Training'
        />
        {pending > 0 ? (
          <SidebarMenuBadge>
            <Badge variant='destructive'>{pending}</Badge>
          </SidebarMenuBadge>
        ) : null}
      </SidebarMenuItem>
      <SidebarMenuItem>
        <SidebarMenuButton
          render={
            <Link href='/docs'>
              <FileText aria-hidden />
              <span>Docs</span>
            </Link>
          }
          tooltip='Docs'
        />
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
export { UserSidebarNav }
