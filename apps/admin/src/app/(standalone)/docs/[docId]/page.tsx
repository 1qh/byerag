'use client'
import type { Id } from 'backend/convex/_generated/dataModel'
import { DocViewer } from '@a/react/components'
import { use } from 'react'

const DocViewerPage = ({ params }: { params: Promise<{ docId: string }> }): React.ReactElement => {
  const { docId } = use(params)
  return <DocViewer docId={docId as Id<'docs'>} />
}
export default DocViewerPage
