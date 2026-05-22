/* eslint-disable no-console */
import { $, file, write } from 'bun'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { APPS } from './convex/apps/manifest'

const skillsByApp: Record<string, Record<string, string>> = {}
for (const [id, app] of Object.entries(APPS)) skillsByApp[id] = app.skills
const rawSrc = await file('sandbox/run.ts').text()
const placeholderRe = /^const AGENT_SKILLS_BY_APP: Record<string, Record<string, string>> = \{\}\s*$/mu
if (!placeholderRe.test(rawSrc))
  throw new Error('build-agent: AGENT_SKILLS_BY_APP placeholder not found in sandbox/run.ts')
const src = rawSrc.replace(
  placeholderRe,
  `const AGENT_SKILLS_BY_APP: Record<string, Record<string, string>> = ${JSON.stringify(skillsByApp)}`
)
const out = `// Auto-generated — do not edit. Source: sandbox/run.ts (with AGENT_SKILLS_BY_APP injected)\nexport const AGENT_SCRIPT = ${JSON.stringify(src)};\n`
await write('convex/agentScript.ts', out)
const totalSkills = Object.values(skillsByApp).reduce((n, m) => n + Object.keys(m).length, 0)
console.log(`convex/agentScript.ts generated (${Object.keys(skillsByApp).length} apps, ${totalSkills} skills injected)`)
const tmp = await mkdtemp(join(tmpdir(), 'x-cli-'))
const cliOutPath = join(tmp, 'x-cli.mjs')
try {
  await $`bun build ../../packages/cli/bin/x.ts --target=node --outfile=${cliOutPath}`.quiet()
  const cliSrc = await file(cliOutPath).text()
  const cliOut = `// Auto-generated — do not edit. Source: packages/cli/bin/x.ts\nexport const CLI_SCRIPT = ${JSON.stringify(cliSrc)};\n`
  await write('convex/cliScript.ts', cliOut)
  console.log('convex/cliScript.ts generated')
} finally {
  await rm(tmp, { force: true, recursive: true })
}
