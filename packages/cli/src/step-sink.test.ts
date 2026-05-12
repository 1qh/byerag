import { describe, expect, it } from 'bun:test'
import { createStepSink } from './builder'
describe(createStepSink, () => {
  it('step() appends to steps in order', () => {
    const s = createStepSink()
    s.step('first')
    s.step('second', { k: 1 })
    expect(s.steps.map(x => x.name)).toStrictEqual(['first', 'second'])
    expect(s.steps[1]?.details).toStrictEqual({ k: 1 })
  })
  it('mergeSteps prefixes sub-steps and preserves tsMs + details', () => {
    const sub = createStepSink()
    sub.step('lookup', { kind: 'country' })
    sub.step('hit', { id: 'US' })
    const parent = createStepSink()
    parent.step('parent-begin')
    parent.mergeSteps('country.', sub.steps)
    parent.step('parent-end')
    expect(parent.steps.map(x => x.name)).toStrictEqual(['parent-begin', 'country.lookup', 'country.hit', 'parent-end'])
    expect(parent.steps[1]?.details).toStrictEqual({ kind: 'country' })
    expect(parent.steps[1]?.tsMs).toBe(sub.steps[0]?.tsMs)
  })
  it('merging empty sub-steps is a no-op', () => {
    const parent = createStepSink()
    parent.mergeSteps('noop.', [])
    expect(parent.steps).toStrictEqual([])
  })
  it('multiple merges accumulate in order', () => {
    const a = createStepSink()
    a.step('a1')
    const b = createStepSink()
    b.step('b1')
    const parent = createStepSink()
    parent.mergeSteps('a.', a.steps)
    parent.mergeSteps('b.', b.steps)
    expect(parent.steps.map(x => x.name)).toStrictEqual(['a.a1', 'b.b1'])
  })
})
