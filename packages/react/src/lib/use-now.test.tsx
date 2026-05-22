import { render } from '@testing-library/react'
import { describe, expect, test } from 'bun:test'
import { useNow } from './use-now'

const Probe = () => {
  const now = useNow()
  return <span>{String(now)}</span>
}
describe('useNow', () => {
  test('returns a numeric timestamp', () => {
    const { container } = render(<Probe />)
    const n = Number(container.textContent)
    expect(Number.isFinite(n)).toBe(true)
    expect(n).toBeGreaterThan(0)
  })
})
