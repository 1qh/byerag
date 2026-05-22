/* oxlint-disable eslint-plugin-react-perf(jsx-no-new-array-as-prop), react-perf/jsx-no-new-array-as-prop */
import { render } from '@testing-library/react'
import { describe, expect, test } from 'bun:test'
import { CostIndicator } from './cost-indicator'

const result = (costUsd: number): string =>
  JSON.stringify({
    duration_ms: 1,
    is_error: false,
    num_turns: 1,
    result: { cost_usd: costUsd },
    subtype: 'success',
    type: 'result'
  })
describe('CostIndicator', () => {
  test('returns null when total cost = 0', () => {
    const { container } = render(<CostIndicator events={[]} />)
    expect(container.textContent).toBe('')
  })
  test('sums multiple result events and formats in cents when under $0.01', () => {
    const { container } = render(<CostIndicator events={[{ content: result(0.003) }, { content: result(0.002) }]} />)
    expect(container.textContent).toMatch(/\$/u)
    expect(container.textContent).toContain('¢')
  })
  test('formats as dollars when >= $0.01', () => {
    const { container } = render(<CostIndicator events={[{ content: result(1.25) }]} />)
    expect(container.textContent).toContain('$1.25')
  })
  test('ignores malformed events', () => {
    const { container } = render(<CostIndicator events={[{ content: 'not json' }, { content: result(0.5) }]} />)
    expect(container.textContent).toContain('$0.50')
  })
})
