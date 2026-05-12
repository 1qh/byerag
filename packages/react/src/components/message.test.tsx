import type { UIMessage } from '@a/react/lib'
/* oxlint-disable eslint-plugin-react-perf(jsx-no-new-object-as-prop), react-perf/jsx-no-new-array-as-prop, react-perf/jsx-no-new-object-as-prop */
import { render } from '@testing-library/react'
import { describe, expect, test } from 'bun:test'
import { PreviewMessage } from './message'
describe('PreviewMessage', () => {
  test('renders text part', () => {
    const m: UIMessage = { id: 'm1', parts: [{ text: 'hello', type: 'text' }], role: 'assistant' }
    const { container } = render(<PreviewMessage isLoading={false} message={m} />)
    expect(container.textContent).toContain('hello')
  })
  test('renders reasoning part', () => {
    const m: UIMessage = { id: 'm2', parts: [{ text: 'thinking...', type: 'reasoning' }], role: 'assistant' }
    const { container } = render(<PreviewMessage isLoading={false} message={m} />)
    expect(container.textContent).toContain('thinking...')
  })
  test('skips data-sources when empty', () => {
    const m: UIMessage = {
      id: 'm3',
      parts: [{ items: [], type: 'data-sources' }],
      role: 'assistant'
    }
    const { container } = render(<PreviewMessage isLoading={false} message={m} />)
    expect(container.querySelector('[data-slot="sources"]')).toBe(null)
  })
})
