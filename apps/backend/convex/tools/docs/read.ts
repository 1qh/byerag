/* eslint-disable @typescript-eslint/only-throw-error -- fail() returns never (throws ToolError internally); rule misclassifies */
import { arg, defineQuery, makeFail } from '../_api'
const PREVIEW_CHARS = 800
const action = defineQuery({
  args: {
    id: arg.string({ description: 'docs._id' })
  },
  cost: 'low',
  description:
    'Materialize a doc to a sandbox cache file and return an envelope pointing at the path. Agent reads the body via the SDK Read tool on the returned path. ACL: mine-scope rows readable only by owner; shared accessible to any signed-in.',
  errorCodes: ['FORBIDDEN', 'NOT_FOUND', 'INVALID_ARG'],
  examples: ['docs read --id kx7abc...'],
  handler: async (ctx, args) => {
    const fail = makeFail('FORBIDDEN', 'NOT_FOUND', 'INVALID_ARG')
    interface DocRow {
      _id: string
      deletedAt?: number
      extractedText?: string
      filename: string
      lang?: string
      mime: string
      owner?: string
      policyStatus?: string
      scanStatus?: string
      scope: 'mine' | 'shared'
      version: number
    }
    const row = (await ctx.db.get(args.id as never)) as DocRow | null
    if (!row) throw fail('NOT_FOUND', `doc ${args.id} not found`)
    if (row.deletedAt !== undefined) throw fail('NOT_FOUND', `doc ${args.id} not found`)
    if (row.scanStatus !== 'clean' || row.policyStatus !== 'approved')
      throw fail('NOT_FOUND', `doc ${args.id} not found`)
    if (row.scope === 'mine' && row.owner !== ctx.auth.owner) throw fail('FORBIDDEN', 'doc not in caller scope')
    const text = row.extractedText ?? ''
    return {
      body: text,
      byte_size: text.length,
      doc_id: row._id,
      filename: row.filename,
      first_lines_preview: text.slice(0, PREVIEW_CHARS),
      lang: row.lang ?? null,
      scope: row.scope,
      total_lines: text === '' ? 0 : text.split('\n').length,
      version: row.version
    }
  }
})
export { action }
