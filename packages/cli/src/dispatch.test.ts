/* oxlint-disable eslint-plugin-jest(no-conditional-expect) */
import type { GenericValidator } from 'convex/values'
import { describe, expect, it } from 'bun:test'
import { v } from 'convex/values'
import type { ArgSpecs } from './types'
import { validateArgs } from './validate'
const str: GenericValidator = v.string()
const fixtureSpecs: ArgSpecs = {
  must: { description: 'required', required: true, v: str },
  opt: { description: 'optional', required: false, v: str }
}
describe(validateArgs, () => {
  it('accepts required + optional', () => {
    const r = validateArgs(fixtureSpecs, { must: 'a', opt: 'b' })
    expect(r.ok).toBeTruthy()
    if (r.ok) expect(r.coerced).toStrictEqual({ must: 'a', opt: 'b' })
  })
  it('accepts required without optional', () => {
    const r = validateArgs(fixtureSpecs, { must: 'a' })
    expect(r.ok).toBeTruthy()
    if (r.ok) expect(r.coerced).toStrictEqual({ must: 'a' })
  })
  it('rejects missing required', () => {
    const r = validateArgs(fixtureSpecs, {})
    expect(r.ok).toBeFalsy()
    if (!r.ok) expect(r.details.missing).toBe('must')
  })
  it('rejects empty-string required', () => {
    const r = validateArgs(fixtureSpecs, { must: '' })
    expect(r.ok).toBeFalsy()
  })
  it('rejects unknown args', () => {
    const r = validateArgs(fixtureSpecs, { must: 'a', xyz: 'extra' })
    expect(r.ok).toBeFalsy()
    if (!r.ok) expect(r.details.unknown).toStrictEqual(['xyz'])
  })
  it('rejects null required', () => {
    const r = validateArgs(fixtureSpecs, { must: null })
    expect(r.ok).toBeFalsy()
  })
  it('drops empty optional from coerced', () => {
    const r = validateArgs(fixtureSpecs, { must: 'a', opt: '' })
    expect(r.ok).toBeTruthy()
    if (r.ok) expect(r.coerced).toStrictEqual({ must: 'a' })
  })
  it('suggests did_you_mean for close typos', () => {
    const r = validateArgs(fixtureSpecs, { msut: 'a' })
    expect(r.ok).toBeFalsy()
    if (!r.ok) expect(r.details.did_you_mean).toStrictEqual({ msut: 'must' })
  })
  it('no suggestion when typo is distant', () => {
    const r = validateArgs(fixtureSpecs, { must: 'a', zzzzzzz: 'x' })
    expect(r.ok).toBeFalsy()
    if (!r.ok) expect(r.details.did_you_mean).toStrictEqual({})
  })
  const constraintSpecs: ArgSpecs = {
    age: { description: 'age', integer: true, max: 120, min: 1, required: false, v: v.number() },
    code: { description: 'iso', pattern: '^[A-Z]{2}$', required: false, v: str }
  }
  it('pattern mismatch rejected', () => {
    const r = validateArgs(constraintSpecs, { code: 'us' })
    expect(r.ok).toBeFalsy()
  })
  it('min/max number rejected', () => {
    expect(validateArgs(constraintSpecs, { age: 0 }).ok).toBeFalsy()
    expect(validateArgs(constraintSpecs, { age: 200 }).ok).toBeFalsy()
  })
  it('integer constraint rejects float', () => {
    expect(validateArgs(constraintSpecs, { age: 1.5 }).ok).toBeFalsy()
  })
})
const KEBAB_RE = /^[a-z][a-z0-9-]*$/u
describe('kEBAB_RE path segment validation', () => {
  it.each(['foo', 'a', 'a-b', 'a1', 'extract-static'])('accepts %s', s => {
    expect(KEBAB_RE.test(s)).toBeTruthy()
  })
  it.each(['Foo', '_admin', 'a_b', '-a', '1a', 'a/b', '../foo', ''])('rejects %s', s => {
    expect(KEBAB_RE.test(s)).toBeFalsy()
  })
})
const camelToKebab = (s: string): string => s.replaceAll(/[A-Z]/gu, m => `-${m.toLowerCase()}`)
describe('camelToKebab', () => {
  it('passes through kebab', () => {
    expect(camelToKebab('extract-static')).toBe('extract-static')
  })
  it('converts camelCase', () => {
    expect(camelToKebab('extractStatic')).toBe('extract-static')
  })
  it('converts PascalCase (with leading dash)', () => {
    expect(camelToKebab('GuessUrl')).toBe('-guess-url')
  })
})
