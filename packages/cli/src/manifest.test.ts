import { describe, expect, it } from 'bun:test'
import { v } from 'convex/values'
import type { ArgSpecs, IntrospectedValidator } from './types'
import { introspect } from './types'
const stringV = introspect(v.string())
const numberV = introspect(v.number())
const enumV = introspect(v.union(v.literal('a'), v.literal('b')))
const optionalV = introspect(v.optional(v.string()))
const idV = introspect(v.id('chats'))
describe('introspect typing', () => {
  it('string kind', () => {
    expect(stringV.kind).toBe('string')
  })
  it('number kind', () => {
    expect(numberV.kind).toBe('float64')
  })
  it('union with literals -> kind union', () => {
    expect(enumV.kind).toBe('union')
  })
  it('optional() preserves inner kind, marks isOptional', () => {
    expect(optionalV.kind).toBe('string')
    expect(optionalV.isOptional).toBe('optional')
  })
  it('id kind', () => {
    expect(idV.kind).toBe('id')
  })
})
const sampleSpecs: ArgSpecs = {
  count: { description: 'Count', required: false, v: v.number() },
  q: { description: 'Query', required: true, v: v.string() }
}
describe('argspec walking', () => {
  it('args reflect required flag', () => {
    expect(sampleSpecs.q?.required).toBeTruthy()
    expect(sampleSpecs.count?.required).toBeFalsy()
  })
})
const fakeUnion: IntrospectedValidator = {
  kind: 'union',
  members: [
    { kind: 'literal', value: 'foo' },
    { kind: 'literal', value: 'bar' }
  ]
}
describe('union literal extraction', () => {
  it('extracts string literals', () => {
    const lits: string[] = []
    for (const m of fakeUnion.members ?? []) if (m.kind === 'literal' && typeof m.value === 'string') lits.push(m.value)
    expect(lits).toStrictEqual(['foo', 'bar'])
  })
})
describe('buildCommand description fallback', () => {
  it('uses inferredDescription when meta.description is blank', async () => {
    const { buildTree } = await import('./manifest')
    const registry = {
      'p.t': {
        argSpecs: {},
        fn: {} as unknown,
        inferredDescription: 'from JSDoc',
        inferredSchema: null,
        kind: 'action' as const,
        meta: {
          cost: 'low' as const,
          deprecated: null,
          description: '',
          deterministic: false,
          errorCodes: [],
          examples: [],
          exclusive: [],
          selfTest: {},
          version: '1'
        },
        path: ['p', 't'] as readonly string[],
        tier: 'user'
      }
    }
    const providers = {
      p: { description: 'p prov', enabled: true, name: 'p', requiresEnv: [] as readonly string[] }
    }
    const tree = buildTree({ providers, registry })
    expect(tree.p?.children?.t?.command?.description).toBe('from JSDoc')
  })
  it('carries meta.deprecated through to ManifestCommand', async () => {
    const { buildTree } = await import('./manifest')
    const registry = {
      'p.t': {
        argSpecs: {},
        fn: {} as unknown,
        inferredDescription: null,
        inferredSchema: null,
        kind: 'action' as const,
        meta: {
          cost: 'low' as const,
          deprecated: { message: 'use v2', replacedBy: 'p.t.v2' },
          description: 'x',
          deterministic: false,
          errorCodes: [],
          examples: [],
          exclusive: [],
          selfTest: {},
          version: '1'
        },
        path: ['p', 't'] as readonly string[],
        tier: 'user'
      }
    }
    const providers = {
      p: { description: '', enabled: true, name: 'p', requiresEnv: [] as readonly string[] }
    }
    const tree = buildTree({ providers, registry })
    expect(tree.p?.children?.t?.command?.deprecated?.replacedBy).toBe('p.t.v2')
  })
  it('prefers meta.description when set', async () => {
    const { buildTree } = await import('./manifest')
    const registry = {
      'p.t': {
        argSpecs: {},
        fn: {} as unknown,
        inferredDescription: 'jsdoc',
        inferredSchema: null,
        kind: 'action' as const,
        meta: {
          cost: 'low' as const,
          deprecated: null,
          description: 'explicit',
          deterministic: false,
          errorCodes: [],
          examples: [],
          exclusive: [],
          selfTest: {},
          version: '1'
        },
        path: ['p', 't'] as readonly string[],
        tier: 'user'
      }
    }
    const providers = {
      p: { description: 'p prov', enabled: true, name: 'p', requiresEnv: [] as readonly string[] }
    }
    const tree = buildTree({ providers, registry })
    expect(tree.p?.children?.t?.command?.description).toBe('explicit')
  })
})
