'use client'
import { DocUpload } from '@a/react/components/doc-upload'
import { api } from 'backend/convex/_generated/api'
import { useQuery } from 'convex/react'
const DocsPage = (): React.ReactElement => {
  const mine = useQuery(api.docs.listMine, {})
  const shared = useQuery(api.docs.listShared, {})
  return (
    <div className='space-y-6 p-6'>
      <section>
        <h2 className='mb-2 font-semibold text-lg'>My docs</h2>
        <DocUpload scope='mine' />
        <ul className='mt-3 space-y-1 text-sm'>
          {mine?.map(d => (
            <li className='font-mono' key={d._id}>
              {d.filename} <span className='text-muted-foreground'>v{d.version}</span>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className='mb-2 font-semibold text-lg'>Shared corpus (read-only)</h2>
        <ul className='space-y-1 text-sm'>
          {shared?.map(d => (
            <li className='font-mono' key={d._id}>
              {d.filename} <span className='text-muted-foreground'>v{d.version}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
export default DocsPage
