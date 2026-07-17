import type { UIMessage } from '@a/react/lib'
import { render } from '@testing-library/react'
import { describe, expect, test } from 'bun:test'
import { Actions } from './message-actions'

const msg = (text: string): UIMessage => ({
  id: 'm1',
  parts: text ? [{ text, type: 'text' }] : [],
  role: 'assistant'
})
describe('Actions', () => {
  test('null while loading', () => {
    const { container } = render(<Actions isLoading message={msg('hi')} />)
    expect(container.querySelector('button')).toBeNull()
  })
  test('null when no text', () => {
    const { container } = render(<Actions isLoading={false} message={msg('')} />)
    expect(container.querySelector('button')).toBeNull()
  })
  test('renders copy button when text present', () => {
    const { container } = render(<Actions isLoading={false} message={msg('hi')} />)
    expect(container.querySelector('button')).toBeTruthy()
  })
})
