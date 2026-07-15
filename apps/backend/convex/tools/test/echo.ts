import { arg, defineQuery } from '../_api'

const action = defineQuery({
  args: { msg: arg.string({ description: 'Text echoed back verbatim' }) },
  cost: 'low',
  description: 'Echo the given message back. Touches no data — the dispatch path is the point.',
  errorCodes: [],
  examples: ['test echo --msg hello'],
  handler: (_ctx, args) => ({ echoed: args.msg })
})
export { action }
