import type { Id } from 'backend/convex/_generated/dataModel'
import type { ReactElement } from 'react'
import { resetFakeConvex, setFakeStore } from '@a/react/test-utils/fake-convex'
import { resetFakeRouter } from '@a/react/test-utils/fake-router'
import { render } from '@a/react/test-utils/render'
import { SidebarProvider } from '@a/ui/components/sidebar'
import { beforeEach, describe, expect, test } from 'bun:test'
import { Chat } from './chat'
const wrap = (ui: ReactElement): ReactElement => <SidebarProvider>{ui}</SidebarProvider>
const userEvent = (id: string, text: string) => ({
  _creationTime: 1,
  _id: id,
  content: JSON.stringify({ message: { content: [{ text, type: 'text' }], role: 'user' }, type: 'user' })
})
const assistantEvent = (id: string, text: string) => ({
  _creationTime: 2,
  _id: id,
  content: JSON.stringify({ message: { content: [{ text, type: 'text' }], role: 'assistant' }, type: 'assistant' })
})
beforeEach(() => {
  resetFakeConvex()
  resetFakeRouter()
  globalThis.localStorage.clear()
})
describe('Chat', () => {
  test('empty state renders greeting + prompt chips', () => {
    const { container } = render(wrap(<Chat chatId={null} />))
    expect(container.textContent).toContain('What can I help with?')
  })
  test('idle chat renders messages + chat header, no greeting', () => {
    const chatId = 'chat-idle' as Id<'chats'>
    setFakeStore({
      messages: new Map([[chatId, [userEvent('u1', 'hi'), assistantEvent('a1', 'hello')]]])
    })
    const { container } = render(wrap(<Chat chatId={chatId} />))
    expect(container.textContent).not.toContain('What can I help with?')
    expect(container.textContent).toContain('hi')
    expect(container.textContent).toContain('hello')
  })
  test('streaming chat shows Thinking shimmer when assistant has no text yet', () => {
    const chatId = 'chat-streaming' as Id<'chats'>
    setFakeStore({
      chatStatus: new Map([[chatId, { streaming: true }]]),
      messages: new Map([[chatId, [userEvent('u1', 'hi')]]])
    })
    const { container } = render(wrap(<Chat chatId={chatId} />))
    expect(container.textContent).toContain('Thinking')
  })
  test('streaming chat with assistant text does NOT show Thinking shimmer', () => {
    const chatId = 'chat-streaming-has-text' as Id<'chats'>
    setFakeStore({
      chatStatus: new Map([[chatId, { streaming: true }]]),
      messages: new Map([[chatId, [userEvent('u1', 'hi'), assistantEvent('a1', 'streaming reply')]]])
    })
    const { container } = render(wrap(<Chat chatId={chatId} />))
    expect(container.textContent).not.toContain('Thinking')
    expect(container.textContent).toContain('streaming reply')
  })
  test('idle chat renders ExportChat + CostIndicator footer', () => {
    const chatId = 'chat-footer' as Id<'chats'>
    setFakeStore({
      messages: new Map([[chatId, [userEvent('u1', 'q'), assistantEvent('a1', 'a')]]])
    })
    const { container } = render(wrap(<Chat chatId={chatId} />))
    expect(container.textContent).toContain('AI can make mistakes')
  })
  test('CanLoadMore shows Load older button', () => {
    const chatId = 'chat-load' as Id<'chats'>
    setFakeStore({
      messages: new Map([[chatId, [userEvent('u1', 'old')]]])
    })
    const { container } = render(wrap(<Chat chatId={chatId} />))
    expect(container.textContent).not.toContain('Load older')
  })
})
