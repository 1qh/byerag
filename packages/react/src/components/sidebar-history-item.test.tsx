/* oxlint-disable eslint-plugin-react-perf(jsx-no-new-object-as-prop), react-perf/jsx-no-new-array-as-prop, react-perf/jsx-no-new-object-as-prop */
import type { Id } from 'backend/convex/_generated/dataModel'
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, mock, test } from 'bun:test'
import type { Chat } from './sidebar-history-item'
import { ChatItem } from './sidebar-history-item'
const noop = (): void => {
  /* Empty */
}
const noopAsync = async (): Promise<void> => {
  /* Empty */
}
const sampleChat: Chat = { _id: 'chat-1' as Id<'chats'>, title: 'Sample conversation', updatedAt: 1 }
describe('ChatItem', () => {
  test('renders the chat title', () => {
    const { container } = render(
      <ChatItem
        chat={sampleChat}
        isActive={false}
        onDelete={noop}
        onRename={noopAsync}
        onSelect={noop}
        setOpenMobile={noop}
      />
    )
    expect(container.textContent).toContain('Sample conversation')
  })
  test('onSelect fires when row clicked', () => {
    const onSelect = mock(noop)
    const { container } = render(
      <ChatItem
        chat={sampleChat}
        isActive={false}
        onDelete={noop}
        onRename={noopAsync}
        onSelect={onSelect}
        setOpenMobile={noop}
      />
    )
    const btn = container.querySelector('button[title]')
    if (!btn) throw new Error('button not found')
    fireEvent.click(btn)
    expect(onSelect).toHaveBeenCalledWith('chat-1')
  })
  test('streaming chat shows spinner label', () => {
    const { container } = render(
      <ChatItem
        chat={{ ...sampleChat, streaming: true }}
        isActive={false}
        onDelete={noop}
        onRename={noopAsync}
        onSelect={noop}
        setOpenMobile={noop}
      />
    )
    expect(container.querySelector('[aria-label="streaming"]')).toBeTruthy()
  })
  test('active chat uses secondary button variant', () => {
    const { container } = render(
      <ChatItem chat={sampleChat} isActive onDelete={noop} onRename={noopAsync} onSelect={noop} setOpenMobile={noop} />
    )
    const btn = container.querySelector('button[title]')
    expect(btn?.className).toContain('bg-secondary')
  })
})
