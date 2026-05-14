'use client'
import { api } from 'backend/convex/_generated/api'
import { useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
const DEPARTMENTS = ['HR', 'Sales', 'IT'] as const
const UsersPage = (): React.ReactElement => {
  const rows = useQuery(api.lib.listUserProfilesForAdmin, {})
  const setDept = useMutation(api.lib.setUserDepartment)
  const setRole = useMutation(api.lib.setUserRole)
  if (rows === undefined) return <div className='p-6'>Loading…</div>
  if (rows.length === 0) return <div className='p-6 text-muted-foreground'>No users or admin role required.</div>
  return (
    <div className='space-y-2 p-6'>
      <h2 className='font-semibold text-lg'>Users ({rows.length})</h2>
      <table className='w-full text-sm'>
        <thead>
          <tr className='border-b text-left'>
            <th className='py-2'>Email</th>
            <th>Role</th>
            <th>Dept</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr className='border-b' key={r._id}>
              <td className='py-2'>{r.userId}</td>
              <td>
                <select
                  className='rounded border px-2 py-1'
                  onChange={e => {
                    setRole({ role: e.target.value as 'admin' | 'user', userId: r.userId }).catch((error: unknown) => {
                      toast.error(String(error))
                    })
                  }}
                  value={r.role}>
                  <option value='user'>user</option>
                  <option value='admin'>admin</option>
                </select>
              </td>
              <td>
                <select
                  className='rounded border px-2 py-1'
                  onChange={e => {
                    setDept({
                      department: (e.target.value || undefined) as 'HR' | 'IT' | 'Sales' | undefined,
                      userId: r.userId
                    }).catch((error: unknown) => {
                      toast.error(String(error))
                    })
                  }}
                  value={r.department ?? ''}>
                  <option value=''>—</option>
                  {DEPARTMENTS.map(d => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </td>
              <td className='text-muted-foreground text-xs'>
                {new Date(r.updatedAt).toISOString().slice(0, 10)} by {r.updatedBy}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
export default UsersPage
