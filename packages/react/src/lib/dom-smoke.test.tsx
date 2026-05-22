import { render } from '@testing-library/react'
import { describe, expect, test } from 'bun:test'

describe('dom smoke', () => {
  test('renders a trivial component', () => {
    const { container } = render(<p>hello</p>)
    expect(container.textContent).toBe('hello')
  })
})
