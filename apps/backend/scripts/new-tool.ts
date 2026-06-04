/* eslint-disable no-console */
import { $ } from 'bun'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const args = process.argv.slice(2)
const pathArg = args.find(a => !a.startsWith('--'))
const kindFlag = args.find(a => a.startsWith('--kind='))?.slice(7) ?? 'action'
if (!pathArg) {
  console.error('usage: bun run new-tool <provider>/<...segments> [--kind=action|query|mutation]')
  console.error('  example: bun run new-tool myprovider/foo/bar --kind=action')
  process.exit(2)
}
if (!['action', 'mutation', 'query'].includes(kindFlag)) {
  console.error(`invalid --kind=${kindFlag}; expected action|query|mutation`)
  process.exit(2)
}
const kind = kindFlag as 'action' | 'mutation' | 'query'
const defineFn = { action: 'defineTool', mutation: 'defineMutation', query: 'defineQuery' }[kind]
const exportName = { action: 'action', mutation: 'mutation', query: 'query' }[kind]
const parts = pathArg.split('/').filter(Boolean)
if (parts.length < 2) {
  console.error('need at least <provider>/<name>')
  process.exit(2)
}
const name = parts.at(-1) ?? ''
const dir = parts.slice(0, -1).join('/')
const filePath = join('convex/tools', dir, `${name}.ts`)
const testPath = join('convex/tools', dir, `${name}.integration.test.ts`)
const relDepth = parts.length
const apiRel = `${'../'.repeat(relDepth - 1)}_api`
const dotPath = parts.join('.')
const tool = `import { arg, ${defineFn} } from '${apiRel}'
/** TODO: replace this JSDoc with a one-line manifest description (what the tool does + when to call it). */
const ${exportName} = ${defineFn}({
  args: {
    query: arg.string({ description: 'TODO: per-arg description' })
  },
  cost: 'low',
  handler: async (_ctx, { query }) => {
    await Promise.resolve()
    return { echo: query }
  },
  selfTest: { query: 'example' }
})
export { ${exportName} }
`
const test = `import { describeTool } from '@test-utils'
describeTool('${dotPath}', ({ ok }) => {
  it('runs without error', async () => {
    await ok({ query: 'hi' })
  })
})
`
mkdirSync(dirname(filePath), { recursive: true })
writeFileSync(filePath, tool)
writeFileSync(testPath, test)
console.log(`created ${filePath} (kind: ${kind})`)
console.log(`created ${testPath}`)
console.log('regenerating codegen…')
await $`bun run build-cli`.nothrow()
console.log('done. run: bun run test')
