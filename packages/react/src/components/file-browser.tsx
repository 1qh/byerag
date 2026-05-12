/** biome-ignore-all lint/performance/noAwaitInLoops: bounded-concurrency tree walker */
/* eslint-disable no-await-in-loop */
/* oxlint-disable eslint(no-await-in-loop) */
'use client'
import { errorMessage } from '@a/react/lib'
import { api } from 'backend/convex/_generated/api'
import { WORKSPACE_PATH } from 'backend/convex/constants'
import { useAction } from 'convex/react'
import { Workspace } from 'idecn'
import { useEffect, useState } from 'react'
interface TreeItem {
  children?: TreeItem[]
  id: string
  name: string
  path: string
}
const FileBrowser = () => {
  const listFiles = useAction(api.fileActions.list)
  const readFile = useAction(api.fileActions.read)
  const [tree, setTree] = useState<TreeItem[]>([])
  const [error, setError] = useState<null | string>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const MAX_DEPTH = 6
    const MAX_CONCURRENT = 4
    const buildTree = async (path: string, depth = 0): Promise<TreeItem[]> => {
      if (depth >= MAX_DEPTH) return []
      const entries = await listFiles({ path })
      const sorted = entries.toSorted((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      const out: TreeItem[] = Array.from({ length: sorted.length })
      let cursor = 0
      const worker = async (): Promise<void> => {
        for (;;) {
          const i = cursor
          cursor += 1
          if (i >= sorted.length) return
          const e = sorted[i]
          if (!e) return
          const full = path === '/' ? `/${e.name}` : `${path}/${e.name}`
          out[i] =
            e.type === 'dir'
              ? { children: await buildTree(full, depth + 1), id: full, name: e.name, path: full }
              : { id: full, name: e.name, path: full }
        }
      }
      await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT, sorted.length) }, worker))
      return out
    }
    const run = async (): Promise<void> => {
      setLoading(true)
      setError(null)
      try {
        setTree(await buildTree(WORKSPACE_PATH))
      } catch (caughtError) {
        const msg = errorMessage(caughtError)
        setError(msg.includes('no sandbox') ? 'No sandbox yet — send a message first to create one.' : msg)
      }
      setLoading(false)
    }
    ;(async () => {
      try {
        await run()
      } catch {
        /* Already captured via setError */
      }
    })()
  }, [listFiles])
  const onOpenFile = async (item: { path: string }): Promise<null | string> => {
    try {
      const result = await readFile({ path: item.path })
      if (result.binary) return `[binary file — ${item.path.split('.').pop()}]`
      return result.content
    } catch (caughtError) {
      return `[error: ${errorMessage(caughtError)}]`
    }
  }
  if (loading) return <div className='p-4 text-xs text-muted-foreground'>Loading files…</div>
  if (error) return <div className='p-4 text-xs text-destructive'>{error}</div>
  if (tree.length === 0)
    return <div className='p-4 text-xs text-muted-foreground'>No files yet. Send a message to create a sandbox.</div>
  return <Workspace expandDepth={2} onOpenFile={onOpenFile} tree={tree} />
}
export { FileBrowser }
