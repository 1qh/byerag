import { describe, expect, it } from 'bun:test'
import { toDispatchError, ToolError } from './error'
describe('toDispatchError fallback', () => {
  it('plain Error → INTERNAL_ERROR permanent', () => {
    const d = toDispatchError(new Error('boom'))
    expect(d.code).toBe('INTERNAL_ERROR')
    expect(d.category).toBe('permanent')
    expect(d.message).toBe('boom')
  })
  it('string throw → INTERNAL_ERROR', () => {
    const d = toDispatchError('bare string')
    expect(d.code).toBe('INTERNAL_ERROR')
  })
  it('toolError passthrough', () => {
    const te = new ToolError('bad input', { code: 'INVALID_ARG' })
    const d = toDispatchError(te)
    expect(d.code).toBe('INVALID_ARG')
    expect(d.category).toBe('input')
  })
})
