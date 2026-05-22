'use client'
import type { ReactNode } from 'react'
import { api } from 'backend/convex/_generated/api'
import { useAction, useMutation } from 'convex/react'
import { useCallback } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app-context'
import { FileUploadProvider } from './composer-extras-context'

const ChatFileUploadProvider = ({ children }: { children: ReactNode }): React.ReactElement => {
  const genUrl = useMutation(api.docs.generateUploadUrl)
  const finalize = useAction(api.docs.upload)
  const scope = useApp().id === 'admin' ? 'shared' : 'mine'
  const upload = useCallback(
    async (file: File): Promise<null | { filename: string; storageId: string }> => {
      const filename = file.name
      const mime = file.type || 'application/octet-stream'
      try {
        const url = await genUrl({})
        const res = await fetch(url, { body: file, headers: { 'Content-Type': mime }, method: 'POST' })
        if (!res.ok) {
          toast.error(`Upload failed for ${filename}`)
          return null
        }
        const { storageId } = (await res.json()) as { storageId: string }
        const r = await finalize({ filename, keepBoth: true, mime, scope, storageId: storageId as never })
        if (r.ok) {
          toast.success(`Attached ${filename}`)
          return { filename, storageId }
        }
        if (r.reason === 'duplicate' && r.duplicate) {
          toast.info(`${filename} is already in your library`)
          return { filename: r.duplicate.filename, storageId }
        }
        if (r.reason === 'quarantined') {
          toast.error(`${filename} rejected: ${r.signature ?? 'suspicious'}`)
          return null
        }
        toast.error(`${filename} rejected: ${r.reason ?? 'unknown'}`)
        return null
      } catch {
        toast.error(`Upload failed for ${filename}`)
        return null
      }
    },
    [genUrl, finalize, scope]
  )
  return <FileUploadProvider upload={upload}>{children}</FileUploadProvider>
}
export { ChatFileUploadProvider }
