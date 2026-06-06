import type { ArgSpec, ArgSpecs } from './types'

interface ValidateErr {
  details: Record<string, unknown>
  message: string
  ok: false
}
interface ValidateOk {
  coerced: Record<string, unknown>
  ok: true
}
const editDistance = (a: string, b: string): number => {
  if (a === b) return 0
  const m = a.length
  const n = b.length
  if (m === 0 || n === 0) return m + n
  const prev: number[] = Array.from({ length: n + 1 }, (_, i) => i)
  const curr: number[] = Array.from({ length: n + 1 }, () => 0)
  for (let i = 1; i <= m; i += 1) {
    curr[0] = i
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min((curr[j - 1] ?? 0) + 1, (prev[j] ?? 0) + 1, (prev[j - 1] ?? 0) + cost)
    }
    for (let j = 0; j <= n; j += 1) prev[j] = curr[j] ?? 0
  }
  return prev[n] ?? 0
}
const suggestFlag = (key: string, valid: string[]): string | undefined => {
  let best: undefined | { dist: number; name: string }
  for (const name of valid) {
    const d = editDistance(key, name)
    if (d <= 5 && (!best || d < best.dist)) best = { dist: d, name }
  }
  return best?.name
}
const checkStringConstraints = (name: string, val: string, spec: ArgSpec): null | ValidateErr => {
  if (spec.pattern !== undefined && !new RegExp(spec.pattern, 'u').test(val))
    return { details: { arg: name, pattern: spec.pattern }, message: `${name}: does not match pattern`, ok: false }
  if (spec.minLength !== undefined && val.length < spec.minLength)
    return {
      details: { arg: name, minLength: spec.minLength },
      message: `${name}: too short (min ${spec.minLength})`,
      ok: false
    }
  if (spec.maxLength !== undefined && val.length > spec.maxLength)
    return {
      details: { arg: name, maxLength: spec.maxLength },
      message: `${name}: too long (max ${spec.maxLength})`,
      ok: false
    }
  return null
}
const coerceRaw = (name: string, raw: unknown, spec: ArgSpec): ValidateErr | { val: unknown } => {
  if (spec.kind === 'number' && typeof raw === 'string') {
    const n = Number(raw)
    if (!Number.isFinite(n)) return { details: { arg: name, raw }, message: `${name}: not a number`, ok: false }
    return { val: n }
  }
  if (spec.kind === 'bool' && typeof raw === 'string') {
    if (raw === 'true' || raw === '1') return { val: true }
    if (raw === 'false' || raw === '0') return { val: false }
    return { details: { arg: name, raw }, message: `${name}: not a boolean`, ok: false }
  }
  return { val: raw }
}
const checkNumberConstraints = (name: string, val: number, spec: ArgSpec): null | ValidateErr => {
  if (spec.min !== undefined && val < spec.min)
    return { details: { arg: name, min: spec.min }, message: `${name}: below min ${spec.min}`, ok: false }
  if (spec.max !== undefined && val > spec.max)
    return { details: { arg: name, max: spec.max }, message: `${name}: above max ${spec.max}`, ok: false }
  if (spec.integer && !Number.isInteger(val))
    return { details: { arg: name }, message: `${name}: must be integer`, ok: false }
  return null
}
const validateArgs = (specs: ArgSpecs, args: Record<string, unknown>): ValidateErr | ValidateOk => {
  const expected = Object.keys(specs)
  const unknownKeys = Object.keys(args).filter(k => !specs[k])
  if (unknownKeys.length > 0) {
    const didYouMean: Record<string, string> = {}
    for (const u of unknownKeys) {
      const s = suggestFlag(u, expected)
      if (s) didYouMean[u] = s
    }
    return {
      details: { did_you_mean: didYouMean, expected, unknown: unknownKeys },
      message: `unknown args: ${unknownKeys.join(', ')}`,
      ok: false
    }
  }
  const coerced: Record<string, unknown> = {}
  for (const [name, spec] of Object.entries(specs)) {
    const raw = args[name]
    const empty = raw === undefined || raw === null || raw === ''
    if (empty && spec.default !== undefined) coerced[name] = spec.default
    else if (empty && spec.required !== false)
      return { details: { expected, missing: name }, message: `missing required: ${name}`, ok: false }
    else if (!empty) {
      const c = coerceRaw(name, raw, spec)
      if ('ok' in c) return c
      const { val } = c
      if (typeof val === 'string') {
        const err = checkStringConstraints(name, val, spec)
        if (err) return err
      }
      if (typeof val === 'number') {
        const err = checkNumberConstraints(name, val, spec)
        if (err) return err
      }
      coerced[name] = val
    }
  }
  return { coerced, ok: true }
}
export { validateArgs }
export type { ValidateErr, ValidateOk }
