interface DocsConflictArgs {
  a: string
  b: string
}
type DocsConflictResult = unknown
interface DocsDiffArgs {
  a: string
  b: string
  context: number
}
interface DocsDiffResult {
  a: {
    _id: string
    filename: string
  }
  b: {
    _id: string
    filename: string
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
  id: string
}
interface DocsReadResult {
  body: string
  byte_size: number
  doc_id: string
  filename: string
  first_lines_preview: string
  lang: null | string
  scope: "mine" | "shared"
  total_lines: number
  version: number
}
interface DocsSimilarArgs {
  dim: "256" | "512" | "768"
  granular?: boolean | boolean
  limit: number
  query: string
  scope: "both" | "mine" | "shared"
}
interface DocsSimilarResult {
  _id: unknown
  _score: number
  chunkSeq: number
  filename: string
  scope: "mine" | "shared"
  snippet: string
}[]
interface TrainingAttemptDetailArgs {
  id: string
}
interface TrainingAttemptDetailResult {
  _id: string
  kind: string
  questionSnapshots?: {
    choicesShuffled: string[]
    correctIndexShuffled: number
    promptText: string
    sourceDocIds: string[]
  }[]
  score?: number
  status: string
  topicId: string
  userId?: string
  total?: number
}
interface TrainingAttemptsArgs {
  limit: number
}
interface TrainingAttemptsResult {
  attempts: {
    _id: unknown
    finishedAt?: number
    kind: "assigned" | "self"
    score?: number
    startedAt: number
    status: "cancelled" | "failed" | "in-progress" | "passed"
    topicId: unknown
  }[]
}
interface TrainingStatusResult {
  topics: {
    _id: string
    myStatus: string
    name: string
    poolSize: number
  }[]
}
interface TrainingTopicsResult {
  topics: {
    _id: string
    name: string
    poolSize: number
  }[]
}
export type { DocsConflictArgs, DocsConflictResult, DocsDiffArgs, DocsDiffResult, DocsGrepArgs, DocsGrepResult, DocsListArgs, DocsListResult, DocsReadArgs, DocsReadResult, DocsSimilarArgs, DocsSimilarResult, TrainingAttemptDetailArgs, TrainingAttemptDetailResult, TrainingAttemptsArgs, TrainingAttemptsResult, TrainingStatusResult, TrainingTopicsResult }