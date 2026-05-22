import { v } from 'convex/values'
import { internalQuery } from '../../_generated/server'

const MENTION_RE = /^@(?<kind>[a-z]+):(?<name>[a-zA-Z0-9_.-]+)$/u
const resolveMention = internalQuery({
  args: { mention: v.string(), userId: v.string() },
  handler: (_ctx, { mention }): null | { _id: null | string; kind: string; name: string } => {
    const match = MENTION_RE.exec(mention)
    if (!match?.groups) return null
    const kind = match.groups.kind ?? ''
    const name = match.groups.name ?? ''
    return { _id: null, kind, name }
  }
})
export { MENTION_RE, resolveMention }
