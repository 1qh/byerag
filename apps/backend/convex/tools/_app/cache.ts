import type { ActionCtx } from '../../_generated/server'
const cached = async <T>(opts: {
  args: unknown
  compute: () => Promise<T>
  ctx: ActionCtx
  mode: string
  owner: string
  toolPath: string
}): Promise<T> => opts.compute()
export { cached }
