/* oxlint-disable react-perf/jsx-no-new-object-as-prop */
import type { UIMessage } from '@a/react/lib'
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, test } from 'bun:test'
import { PreviewMessage } from './message'

describe('PreviewMessage', () => {
  test('renders text part', () => {
    const m: UIMessage = { id: 'm1', parts: [{ text: 'hello', type: 'text' }], role: 'assistant' }
    const { container } = render(<PreviewMessage isLoading={false} message={m} />)
    expect(container.textContent).toContain('hello')
  })
  test('renders reasoning part inside an expandable activity block', () => {
    const m: UIMessage = { id: 'm2', parts: [{ text: 'thinking...', type: 'reasoning' }], role: 'assistant' }
    const { container } = render(<PreviewMessage isLoading={false} message={m} />)
    const toggle = container.querySelector('button')
    if (!toggle) throw new Error('no activity-block toggle')
    fireEvent.click(toggle)
    expect(container.textContent).toContain('thinking...')
  })
  test('reasoning part is visible without interaction while still loading', () => {
    const m: UIMessage = { id: 'm4', parts: [{ text: 'thinking...', type: 'reasoning' }], role: 'assistant' }
    const { container } = render(<PreviewMessage isLoading message={m} />)
    expect(container.textContent).toContain('thinking...')
  })
  test('skips data-sources when empty', () => {
    const m: UIMessage = {
      id: 'm3',
      parts: [{ items: [], type: 'data-sources' }],
      role: 'assistant'
    }
    const { container } = render(<PreviewMessage isLoading={false} message={m} />)
    expect(container.querySelector('[data-slot="sources"]')).toBeNull()
  })
})
