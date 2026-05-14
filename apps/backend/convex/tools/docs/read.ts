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
  examples: ['byerag docs read --id kx7abc...'],
  handler: async (ctx, args) => {
    const fail = makeFail('docs.read')
    const cap = Math.min(args.bytes, MAX_BYTES)
    const row = await ctx.db.get(args.id as never)
    if (!row) throw fail({ code: 'NOT_FOUND', message: `doc ${args.id} not found` })
    if (row.scope === 'mine' && row.owner !== ctx.auth.owner)
      throw fail({ code: 'FORBIDDEN', message: 'doc not in caller scope' })
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
