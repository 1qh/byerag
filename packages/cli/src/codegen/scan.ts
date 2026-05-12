/** biome-ignore-all lint/nursery/noContinue: classify-or-skip loop */
/** biome-ignore-all lint/nursery/noComponentHookFactories: codegen helper, not a React hook */
/** biome-ignore-all lint/performance/useTopLevelRegex: codegen script */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential per-root scan */
/* eslint-disable no-continue, no-await-in-loop */
/* oxlint-disable eslint-plugin-unicorn(prefer-spread) */
import { Glob } from 'bun'
import { readFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
const TIER_ADMIN_PREFIX = '_admin'
const SKIP_DIRS = new Set(['_app', '_lib', 'generated'])
const CAMEL_RE = /[A-Z]/gu
const camelToKebab = (s: string): string => s.replace(CAMEL_RE, m => `-${m.toLowerCase()}`)
interface ToolFile {
  absPath: string
  allExports: readonly string[]
  cliPath: string[]
  exportName: 'action' | 'mutation' | 'query'
  fnAccessor: string
  importBase: null | string
  importPath: string
  importVar: string
  kind: 'action' | 'mutation' | 'query'
  modulePath: string[]
  registryKey: string
  tier: 'admin' | 'user'
  useNode: boolean
}
interface ToolsRootSpec {
  importBase: null | string
  root: string
}
const KIND_RE = /(?:export )?const (?<exp>action|query|mutation) = define(?<def>Tool|Query|Mutation)\(/u
const EXPORT_BLOCK_RE = /^export\s*\{\s*(?<names>[^}]+)\s*\}/mu
const USE_NODE_RE = /^['"]use node['"]/mu
const detectKind = async (
  abs: string
): Promise<null | {
  allExports: string[]
  exportName: 'action' | 'mutation' | 'query'
  kind: 'action' | 'mutation' | 'query'
  useNode: boolean
}> => {
  const text = await readFile(abs, 'utf8')
  const m = KIND_RE.exec(text)
  if (!m) return null
  const exportName = (m.groups as { def: string; exp: string }).exp as 'action' | 'mutation' | 'query'
  const kindMap = { Mutation: 'mutation', Query: 'query', Tool: 'action' } as const
  const kind = kindMap[(m.groups as { def: string; exp: string }).def as 'Mutation' | 'Query' | 'Tool']
  const blockMatch = EXPORT_BLOCK_RE.exec(text)
  const allExports = blockMatch?.groups?.names
    ? blockMatch.groups.names
        .split(',')
        .map(s => s.trim())
        .filter(s => s && !s.startsWith('type '))
    : [exportName]
  const useNode = USE_NODE_RE.test(text)
  return { allExports, exportName, kind, useNode }
}
const collectOne = async (
  spec: ToolsRootSpec,
  outDir: string,
  shimsDir: null | string
): Promise<{ providers: string[]; tools: ToolFile[] }> => {
  const tools: ToolFile[] = []
  const providers = new Set<string>()
  const glob = new Glob('*/**/*.ts')
  const emitShim = shimsDir !== null && spec.importBase !== null
  for await (const rel of glob.scan({ cwd: spec.root })) {
    const segments = rel.split('/')
    const [provider] = segments
    const filename = segments.at(-1)
    if (!(provider && filename) || segments.length < 2) continue
    if (SKIP_DIRS.has(provider)) continue
    if (segments.slice(1).some(s => s.startsWith('_'))) continue
    const baseName = filename.replace(/\.ts$/u, '')
    const moduleSegs = [...segments.slice(0, -1), baseName]
    const cliSegs = moduleSegs.map((s, i) => (i === 0 ? camelToKebab(s.replace(/^_/u, '')) : camelToKebab(s)))
    const tier = provider.startsWith(TIER_ADMIN_PREFIX) ? 'admin' : 'user'
    const importTarget = emitShim && shimsDir ? resolve(shimsDir, ...moduleSegs) : resolve(spec.root, ...moduleSegs)
    const relImp = relative(outDir, importTarget).replaceAll('\\', '/')
    const importPath = relImp.startsWith('.') ? relImp : `./${relImp}`
    const importVar = `${moduleSegs.map((s, i) => (i === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1))).join('')}_mod`
    const absPath = resolve(spec.root, rel)
    const detected = await detectKind(absPath)
    if (!detected) continue
    providers.add(provider)
    const fnAccessor = `internal.tools.${moduleSegs.join('.')}.${detected.exportName}`
    tools.push({
      absPath,
      allExports: detected.allExports,
      cliPath: cliSegs,
      exportName: detected.exportName,
      fnAccessor,
      importBase: emitShim ? spec.importBase : null,
      importPath,
      importVar,
      kind: detected.kind,
      modulePath: moduleSegs,
      registryKey: cliSegs.join('.'),
      tier,
      useNode: detected.useNode
    })
  }
  return { providers: [...providers], tools }
}
const collect = async (
  roots: ToolsRootSpec[],
  outDir: string,
  shimsDir: null | string = null
): Promise<{ providers: string[]; tools: ToolFile[] }> => {
  const allTools: ToolFile[] = []
  const allProviders = new Set<string>()
  for (const spec of roots) {
    const { providers, tools } = await collectOne(spec, outDir, shimsDir)
    for (const p of providers) {
      if (allProviders.has(p)) throw new Error(`provider name collision across roots: ${p}`)
      allProviders.add(p)
    }
    allTools.push(...tools)
  }
  return {
    providers: [...allProviders].toSorted(),
    tools: allTools.toSorted((a, b) => a.registryKey.localeCompare(b.registryKey))
  }
}
export { camelToKebab, collect }
export type { ToolFile, ToolsRootSpec }
