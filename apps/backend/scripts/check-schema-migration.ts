#!/usr/bin/env bun
/* eslint-disable no-console */
import { $ } from 'bun'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SCHEMA_PATH = join(import.meta.dir, '..', 'convex', 'schema.ts')
const head = await $`git show HEAD:apps/backend/convex/schema.ts`
  .cwd(join(import.meta.dir, '..', '..', '..'))
  .quiet()
  .nothrow()
if (head.exitCode !== 0) {
  console.log('skip: no HEAD schema (initial commit?)')
  process.exit(0)
}
const before = head.stdout.toString()
// oxlint-disable-next-line node/no-sync
const after = readFileSync(SCHEMA_PATH, 'utf8')
if (before === after) {
  console.log('✔ schema unchanged')
  process.exit(0)
}
const issues: string[] = []
// eslint-disable-next-line sonarjs/super-linear-regex -- quantifiers bounded by disjoint delimiters (:, }), no ambiguous adjacency, linear
const TABLE_RE = /(?<name>\w+):\s*defineTable\(\{(?<body>[^}]*)\}/gu
const tables = (src: string): Map<string, string> => {
  const out = new Map<string, string>()
  for (const m of src.matchAll(TABLE_RE))
    if (m.groups?.name && m.groups.body !== undefined) out.set(m.groups.name, m.groups.body)
  return out
}
const tBefore = tables(before)
const tAfter = tables(after)
for (const [name, body] of tAfter) {
  const oldBody = tBefore.get(name)
  if (oldBody) {
    // eslint-disable-next-line sonarjs/super-linear-regex -- quantifiers bounded by disjoint delimiters (:, (, )), no ambiguous adjacency, linear
    const FIELD_RE = /(?<f>\w+):\s*(?<type>v\.[\w.]+\([^)]*\))/gu
    const oldFields = new Set([...oldBody.matchAll(FIELD_RE)].map(m => m.groups?.f).filter(Boolean) as string[])
    for (const m of body.matchAll(FIELD_RE)) {
      const field = m.groups?.f
      const type = m.groups?.type ?? ''
      if (field && !(oldFields.has(field) || type.includes('v.optional')))
        issues.push(
          `'${name}.${field}' added as REQUIRED — existing rows will fail validation. Make optional or backfill before deploy.`
        )
    }
    for (const f of oldFields)
      if (!new RegExp(`\\b${f}\\b`, 'u').test(body))
        issues.push(
          `'${name}.${f}' REMOVED — existing rows still have it. Use schema-changes-only deploy or migrate first.`
        )
  } else if (!body.includes('v.optional') && body.trim().length > 0)
    issues.push(`new table '${name}' — verify deploy migrates existing rows or table starts empty`)
}
const INDEX_RE = /\.index\('(?<n>[^']+)',\s*\[(?<fields>[^\]]+)\]\)/gu
const indexes = (src: string, table: string): Map<string, string> => {
  const out = new Map<string, string>()
  const block = (() => {
    const i = src.indexOf(`${table}: defineTable`)
    if (i === -1) return ''
    const close = src.indexOf('})', i)
    return close === -1 ? '' : src.slice(i, close)
  })()
  for (const m of block.matchAll(INDEX_RE)) if (m.groups?.n) out.set(m.groups.n, m.groups.fields ?? '')
  return out
}
for (const name of tAfter.keys())
  if (tBefore.has(name)) {
    const idxBefore = indexes(before, name)
    const idxAfter = indexes(after, name)
    for (const [n, fields] of idxAfter) {
      const old = idxBefore.get(n)
      if (old !== undefined && old !== fields)
        issues.push(`'${name}' index '${n}' fields changed — index will rebuild; deploy may stall on large tables`)
    }
    for (const n of idxBefore.keys())
      if (!idxAfter.has(n)) issues.push(`'${name}' index '${n}' REMOVED — dependent queries will scan or fail`)
  }
if (issues.length === 0) {
  console.log('✔ schema diff appears safe')
  process.exit(0)
}
console.error(`✘ ${issues.length} potentially-unsafe schema change(s) vs HEAD:`)
for (const i of issues) console.error(`  ${i}`)
process.exit(1)
