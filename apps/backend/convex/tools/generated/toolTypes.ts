interface DocsDiffArgs {
  a: string
  b: string
  context: number
}
interface DocsDiffResult {
  a: {
    _id: unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown
    filename: unknown
  }
  b: {
    _id: unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown
    filename: unknown
  }
  diff: string
}
interface DocsGrepArgs {
  limit: number
  pattern: string
  scope: "both" | "mine" | "shared"
}
interface DocsGrepResult {
  hits: {
    docId: string
    filename: string
    lineNumber: number
    snippet: string
  }[]
  truncated: boolean
}
interface DocsListArgs {
  limit: number
  scope: "both" | "mine" | "shared"
}
interface DocsListResult {
  _id: unknown
  filename: string
  fileSize: number
  mime: string
  scope: "mine" | "shared"
  uploadedAt: number
}[]
interface DocsReadArgs {
  bytes: number
  id: string
}
interface DocsReadResult {
  _id: unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown
  content: unknown
  filename: unknown
  lang: unknown
  mime: unknown
  scope: unknown
  truncated: boolean
  version: unknown
}
export type { DocsDiffArgs, DocsDiffResult, DocsGrepArgs, DocsGrepResult, DocsListArgs, DocsListResult, DocsReadArgs, DocsReadResult }