/* eslint-disable @typescript-eslint/only-throw-error -- fail() returns never (throws ToolError internally); rule misclassifies */
import { arg, defineQuery, makeFail } from '../_api'
const MAX_BYTES = 2_000_000
const action = defineQuery({
  args: {
    bytes: arg.number({ default: 200_000, description: 'Cap on returned bytes' }),
    id: arg.string({ description: 'docs._id' })
  },
  cost: 'low',
  description:
    'Fetch extracted text of a doc. ACL: mine-scope rows readable only by owner; shared accessible to any signed-in.',
  errorCodes: ['FORBIDDEN', 'NOT_FOUND', 'INVALID_ARG'],
  examples: ['docs read --id kx7abc...'],
  handler: async (ctx, args) => {
    const fail = makeFail('FORBIDDEN', 'NOT_FOUND', 'INVALID_ARG')
    const cap = Math.min(args.bytes, MAX_BYTES)
    interface DocRow {
      _id: string
      extractedText?: string
      filename: string
      lang?: string
      mime: string
      owner?: string
      scope: 'mine' | 'shared'
      version: number
    }
    const row = (await ctx.db.get(args.id as never)) as DocRow | null
    if (!row) throw fail('NOT_FOUND', `doc ${args.id} not found`)
    if (row.scope === 'mine' && row.owner !== ctx.auth.owner) throw fail('FORBIDDEN', 'doc not in caller scope')
    const text = row.extractedText ?? ''
    return {
      _id: row._id,
      content: text.slice(0, cap),
      filename: row.filename,
      lang: row.lang ?? null,
      mime: row.mime,
      scope: row.scope,
      truncated: text.length > cap,
      version: row.version
    }
  }
})
export { action }
