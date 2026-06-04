'use client'
import { Input } from '@a/ui/components/input'
import { NativeSelect, NativeSelectOption } from '@a/ui/components/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@a/ui/components/table'
import { api } from 'backend/convex/_generated/api'
import { useMutation, useQuery } from 'convex/react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

const DEPARTMENTS = ['Safety, Health and Environment'] as const
const UsersPage = (): React.ReactElement => {
  const rows = useQuery(api.lib.listUserProfilesForAdmin, {})
  const setRole = useMutation(api.lib.setUserRole)
  const setDept = useMutation(api.lib.setUserDepartment)
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (rows ?? []).filter(r => q === '' || r.userId.toLowerCase().includes(q))
  }, [rows, search])
  const onRoleChange = (userId: string, role: 'admin' | 'user'): void => {
    setRole({ role, userId })
      // oxlint-disable-next-line promise/prefer-await-to-then, promise/prefer-await-to-callbacks -- React event handler
      .then(() => toast.success(`Role for ${userId} → ${role}`))
      // oxlint-disable-next-line promise/prefer-await-to-then, promise/prefer-await-to-callbacks -- React event handler
      .catch((error: unknown) => toast.error(String(error)))
  }
  const onDeptChange = (userId: string, department: string): void => {
    setDept({ department: department || undefined, userId })
      // oxlint-disable-next-line promise/prefer-await-to-then, promise/prefer-await-to-callbacks -- React event handler
      .then(() => toast.success(`Department for ${userId} → ${department || '—'}`))
      // oxlint-disable-next-line promise/prefer-await-to-then, promise/prefer-await-to-callbacks -- React event handler
      .catch((error: unknown) => toast.error(String(error)))
  }
  if (rows === undefined) return <div className='p-6'>Loading…</div>
  if (rows.length === 0) return <div className='p-6 text-muted-foreground'>No users or admin role required.</div>
  return (
    <section className='space-y-3 p-6'>
      <div className='space-y-1'>
        <h2 className='font-semibold text-lg'>Accounts ({rows.length})</h2>
        <p className='text-muted-foreground text-xs'>
          All sign-ins — admins and users. Dashboard and Training counts show users only.
        </p>
      </div>
      <Input
        className='h-8 max-w-sm'
        onChange={e => setSearch(e.target.value)}
        placeholder='Search by email…'
        value={search}
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map(r => (
            <TableRow key={r._id}>
              <TableCell className='font-mono text-xs'>{r.userId}</TableCell>
              <TableCell>
                <NativeSelect
                  aria-label='User role'
                  onChange={e => onRoleChange(r.userId, e.target.value as 'admin' | 'user')}
                  value={r.role}>
                  <NativeSelectOption value='user'>user</NativeSelectOption>
                  <NativeSelectOption value='admin'>admin</NativeSelectOption>
                </NativeSelect>
              </TableCell>
              <TableCell>
                <NativeSelect
                  aria-label='User department'
                  onChange={e => onDeptChange(r.userId, e.target.value)}
                  value={r.department ?? ''}>
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
