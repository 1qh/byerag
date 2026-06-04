import type { UIMessage } from '@a/react/lib'
import { render } from '@testing-library/react'
import { describe, expect, test } from 'bun:test'
import { Messages } from './messages'

const user = (id: string, text: string): UIMessage => ({ id, parts: [{ text, type: 'text' }], role: 'user' })
const assistant = (id: string, text: string): UIMessage => ({ id, parts: [{ text, type: 'text' }], role: 'assistant' })
describe('Messages', () => {
  test('renders user + assistant messages in order', () => {
    const { container } = render(
      <Messages awaitingAssistant={false} messages={[user('u1', 'hi'), assistant('a1', 'hello')]} status='ready' />
    )
    expect(container.textContent).toContain('hi')
    expect(container.textContent).toContain('hello')
  })
  test('awaitingAssistant=true shows Thinking shimmer below', () => {
    const { container } = render(<Messages awaitingAssistant messages={[user('u1', 'hi')]} status='streaming' />)
    expect(container.textContent).toContain('Thinking...')
  })
  test('awaitingAssistant=false does NOT show Thinking shimmer', () => {
    const { container } = render(
      <Messages awaitingAssistant={false} messages={[user('u1', 'hi'), assistant('a1', 'done')]} status='ready' />
    )
    expect(container.textContent).not.toContain('Thinking...')
  })
  test('empty messages with awaitingAssistant=true still shows shimmer', () => {
    const { container } = render(<Messages awaitingAssistant messages={[]} status='submitted' />)
    expect(container.textContent).toContain('Thinking...')
  })
})
