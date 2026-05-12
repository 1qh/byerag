'use client'
import type { ReactNode } from 'react'
import { createContext, use } from 'react'
type FileUploadFn = (file: File) => Promise<null | UploadedFile>
interface UploadedFile {
  filename: string
  storageId: string
}
const FileUploadContext = createContext<FileUploadFn | undefined>(undefined)
const FileUploadProvider = ({ children, upload }: { children: ReactNode; upload?: FileUploadFn }) => (
  <FileUploadContext value={upload}>{children}</FileUploadContext>
)
const useFileUploadCtx = (): FileUploadFn | undefined => use(FileUploadContext)
export { FileUploadContext, FileUploadProvider, useFileUploadCtx }
export type { FileUploadFn, UploadedFile }
