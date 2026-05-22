'use client'
import { NativeSelect, NativeSelectOption } from '@a/ui/components/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@a/ui/components/table'
import { api } from 'backend/convex/_generated/api'
import { useQuery } from 'convex/react'

const DEPARTMENTS = ['Safety, Health and Environment'] as const
const UsersPage = (): React.ReactElement => {
  const rows = useQuery(api.lib.listUserProfilesForAdmin, {})
  if (rows === undefined) return <div className='p-6'>Loading…</div>
  if (rows.length === 0) return <div className='p-6 text-muted-foreground'>No users or admin role required.</div>
  return (
    <section className='space-y-2 p-6'>
      <h2 className='font-semibold text-lg'>Users ({rows.length})</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Dept</TableHead>
            <TableHead>Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(r => (
            <TableRow key={r._id}>
              <TableCell>{r.userId}</TableCell>
              <TableCell>
                <NativeSelect aria-label='User role' onChange={() => undefined} value={r.role}>
                  <NativeSelectOption value='user'>user</NativeSelectOption>
                  <NativeSelectOption value='admin'>admin</NativeSelectOption>
                </NativeSelect>
              </TableCell>
              <TableCell>
                <NativeSelect aria-label='User department' onChange={() => undefined} value={r.department ?? ''}>
                  <NativeSelectOption value=''>—</NativeSelectOption>
                  {DEPARTMENTS.map(d => (
                    <NativeSelectOption key={d} value={d}>
                      {d}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </TableCell>
              <TableCell className='text-muted-foreground text-xs'>
                {new Date(r.updatedAt).toISOString().slice(0, 10)} by {r.updatedBy}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  )
}
export default UsersPage
