/* eslint-disable @typescript-eslint/only-throw-error -- fail() returns never (throws ToolError internally); rule misclassifies */
import { arg, defineQuery, makeFail } from '../_api'
const CONTEXT_LINES = 3
const aclCheck = (row: { owner?: string; scope: 'mine' | 'shared' }, caller: string): boolean =>
  row.scope === 'shared' || row.owner === caller
const unifiedDiff = (a: string[], b: string[], context: number): string => {
  const out: string[] = []
  const maxLen = Math.max(a.length, b.length)
  let i = 0
  while (i < maxLen) {
    if (a[i] === b[i]) {
      i += 1
      continue
    }
    const start = Math.max(0, i - context)
    let end = i
    while (end < maxLen && a[end] !== b[end]) end += 1
    const stop = Math.min(maxLen, end + context)
    out.push(`@@ ${start + 1},${stop - start} ${start + 1},${stop - start} @@`)
    for (let k = start; k < stop; k += 1) {
      const av = a[k]
      const bv = b[k]
      if (av === bv) out.push(` ${av ?? ''}`)
      else {
        if (av !== undefined) out.push(`-${av}`)
        if (bv !== undefined) out.push(`+${bv}`)
      }
    }
    i = stop
  }
  return out.join('\n')
}
const action = defineQuery({
  args: {
    a: arg.string({ description: 'docId A' }),
    b: arg.string({ description: 'docId B' }),
    context: arg.number({ default: CONTEXT_LINES, description: 'Lines of context per hunk' })
  },
  cost: 'medium',
  description: 'Mechanical unified diff between two docs (line-level). ACL: each doc independently checked.',
  errorCodes: ['FORBIDDEN', 'NOT_FOUND'],
  examples: ['docs diff --a kx7abc --b kx7def'],
  handler: async (ctx, args) => {
    const fail = makeFail('FORBIDDEN', 'NOT_FOUND')
    type DocRow = { _id: string; extractedText?: string; filename: string; owner?: string; scope: 'mine' | 'shared' }
    const rowA = (await ctx.db.get(args.a as never)) as DocRow | null
    if (!rowA) throw fail('NOT_FOUND', `doc ${args.a} not found`)
    if (!aclCheck(rowA, ctx.auth.owner)) throw fail('FORBIDDEN', 'doc A not in caller scope')
    const rowB = (await ctx.db.get(args.b as never)) as DocRow | null
    if (!rowB) throw fail('NOT_FOUND', `doc ${args.b} not found`)
    if (!aclCheck(rowB, ctx.auth.owner)) throw fail('FORBIDDEN', 'doc B not in caller scope')
    const linesA = (rowA.extractedText ?? '').split('\n')
    const linesB = (rowB.extractedText ?? '').split('\n')
    return {
      a: { _id: rowA._id, filename: rowA.filename },
      b: { _id: rowB._id, filename: rowB.filename },
      diff: unifiedDiff(linesA, linesB, args.context)
    }
  }
})
export { action }
