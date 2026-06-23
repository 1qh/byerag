import { readFileSync } from 'node:fs'
import { setHermeticAdapter } from './hermetic'

type FixtureMap = Record<string, unknown>
interface FixtureRule {
  match?: string
  response: unknown
}
const isRuleArray = (v: unknown): v is FixtureRule[] =>
  Array.isArray(v) && v.every(r => typeof r === 'object' && r !== null && 'response' in r)
const loadHermeticFixtures = (path: string): void => {
  // oxlint-disable-next-line node/no-sync
  const data = JSON.parse(readFileSync(path, 'utf8')) as FixtureMap
  setHermeticAdapter((op, payload) => {
    const entry = data[op]
    if (entry === undefined) return
    if (isRuleArray(entry)) {
      const s = JSON.stringify(payload)
      for (const rule of entry) if (rule.match === undefined || s.includes(rule.match)) return rule.response
      return
    }
    return entry
  })
}
export { loadHermeticFixtures }
export type { FixtureMap, FixtureRule }
