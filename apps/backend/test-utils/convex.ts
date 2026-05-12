/** biome-ignore-all lint/style/noProcessEnv: test env reset */
/** biome-ignore-all lint/nursery/noUndeclaredEnvVars: test env reset */
import type { TestConvex } from 'convex-test'
/**
 * Narrow-surface wrapper around convex-test. Pushes its `Record<string, () => Promise<any>>`
 * module-argument surface behind a typed boundary so test files stay clean of unsafe-* disables.
 * Also drains in-flight scheduled functions after each test so async agent:run tasks don't spill
 * rollback errors into the next test, and resets the hermetic adapter between tests.
 */
import { setHermeticAdapter } from '@a/cli'
import { Glob } from 'bun'
import { afterEach } from 'bun:test'
import { convexTest } from 'convex-test'
import { join, resolve } from 'node:path'
import schema from '../convex/schema'
type T = TestConvex<typeof schema>
delete process.env.SITE_URL
const convexDir = resolve(import.meta.dirname, '../convex')
const loadModules = (): Record<string, () => Promise<Record<string, unknown>>> => {
  const out: Record<string, () => Promise<Record<string, unknown>>> = {}
  const glob = new Glob('**/*.{ts,js}')
  for (const rel of glob.scanSync({ cwd: convexDir })) {
    const abs = join(convexDir, rel)
    out[`../convex/${rel}`] = async () => (await import(abs)) as Record<string, unknown>
  }
  return out
}
const pending = new Set<T>()
afterEach(async () => {
  const ts = [...pending]
  pending.clear()
  await Promise.all(ts.map(async t => t.finishAllScheduledFunctions(() => undefined).catch(() => undefined)))
  setHermeticAdapter(null)
})
const makeTest = (): T => {
  const t = convexTest(schema, loadModules())
  pending.add(t)
  return t
}
export { makeTest }
