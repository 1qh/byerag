/** biome-ignore-all lint/nursery/noContinue: loop skip */
import type { ManifestArg, RegistryEntry } from './types'
import { buildArgs } from './manifest'
interface ToolListOpts {
  includeExamples?: boolean
  includeExclusive?: boolean
  tier?: 'admin' | 'user'
  verbose?: boolean
}
const argTypeHint = (a: ManifestArg): string => {
  if (a.enum && a.enum.length > 0) return a.enum.join('|')
  if (a.pattern) return a.pattern
  if (a.type === 'number') {
    const range = [a.min, a.max].filter(v => v !== undefined).join('-')
    return range ? `int ${range}` : 'number'
  }
  return a.type
}
const renderArg = (a: ManifestArg): string => {
  const aliases = a.aliases && a.aliases.length > 0 ? ` (aka ${a.aliases.join(', ')})` : ''
  return `  ${a.name} <${argTypeHint(a)}>  ${a.description}${aliases}`
}
const renderVerbose = (entry: RegistryEntry): string => {
  const desc = entry.meta.description === '' ? (entry.inferredDescription ?? '(no description)') : entry.meta.description
  const args = buildArgs(entry.argSpecs)
  const required = args.filter(a => a.required)
  const optional = args.filter(a => !a.required)
  const parts: string[] = [`## ${entry.path.join(' ')}`, desc]
  if (required.length > 0) parts.push('required:', ...required.map(renderArg))
  if (optional.length > 0) parts.push('optional:', ...optional.map(renderArg))
  if (entry.meta.exclusive.length > 0)
    parts.push(
      `mutually-exclusive: ${entry.meta.exclusive
        .map(g => g.map(f => `--${f.replaceAll('_', '-')}`).join(' | '))
        .join(' ; ')}`
    )
  if (entry.meta.examples.length > 0) {
    parts.push('examples:')
    for (const ex of entry.meta.examples) parts.push(`  ${ex}`)
  }
  if (entry.meta.deprecated) parts.push(`DEPRECATED → ${entry.meta.deprecated.replacedBy}`)
  return parts.join('\n')
}
const renderCompact = (entry: RegistryEntry, opts: ToolListOpts): string[] => {
  const lines: string[] = []
  const desc = entry.meta.description === '' ? (entry.inferredDescription ?? '') : entry.meta.description
  const base = `- ${entry.path.join(' ')} — ${desc}`
  const annotations: string[] = []
  if (entry.meta.deprecated) annotations.push(`DEPRECATED → ${entry.meta.deprecated.replacedBy}`)
  if (opts.includeExclusive && entry.meta.exclusive.length > 0)
    annotations.push(
      `one-of: ${entry.meta.exclusive.map(g => g.map(f => `--${f.replaceAll('_', '-')}`).join('|')).join(' ; ')}`
    )
  const head = annotations.length > 0 ? `${base}  (${annotations.join('; ')})` : base
  lines.push(head)
  if (opts.includeExamples) for (const ex of entry.meta.examples) lines.push(`    e.g. ${ex}`)
  return lines
}
const toolListBlock = (registry: Readonly<Record<string, RegistryEntry>>, opts: ToolListOpts = {}): string => {
  const tier = opts.tier ?? 'user'
  const entries = Object.values(registry)
    .filter(e => e.tier === tier)
    .toSorted((a, b) => a.path.join(' ').localeCompare(b.path.join(' ')))
  if (opts.verbose) return entries.map(e => renderVerbose(e)).join('\n\n')
  const lines: string[] = []
  for (const e of entries) lines.push(...renderCompact(e, opts))
  return lines.join('\n')
}
export { toolListBlock }
export type { ToolListOpts }
