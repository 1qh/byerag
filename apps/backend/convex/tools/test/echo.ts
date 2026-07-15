import { arg, defineQuery } from '../_api'

const action = defineQuery({
  args: { msg: arg.string({ description: 'Text echoed back verbatim' }) },
  cost: 'low',
  description: 'Echo the given message back. Touches no data — the dispatch path is the point.',
  errorCodes: [],
  examples: ['test echo --msg hello'],
  // eslint-disable-next-line @typescript-eslint/require-await -- defineQuery's handler type mandates a Promise return; every other tool awaits ctx.db, but this fixture touches no data on purpose
  handler: async (_ctx, args) => ({ echoed: args.msg })
})
export { action }
