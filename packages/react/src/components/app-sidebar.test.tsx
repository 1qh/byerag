/* eslint-disable @typescript-eslint/no-unnecessary-condition, @typescript-eslint/no-unused-vars */
import type { Id } from 'backend/convex/_generated/dataModel'
import { resetFakeConvex, setFakeStore } from '@a/react/test-utils/fake-convex'
import { render } from '@a/react/test-utils/render'
import { SidebarProvider } from '@a/ui/components/sidebar'
import { fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, test } from 'bun:test'
import { AppSidebar } from './app-sidebar'
const noop = (): void => {
  /* Empty */
}
const noopId = (_id: Id<'chats'>): void => {
  /* Empty */
}
beforeEach(() => {
  resetFakeConvex()
})
describe('AppSidebar', () => {
  test('null when no current user', () => {
    setFakeStore({ currentUser: null })
    const { container } = render(
      <SidebarProvider>
        <AppSidebar activeChatId={null} onNewChat={noop} onSelect={noopId} />
      </SidebarProvider>
    )
    expect(container.textContent).toBe('')
  })
  test('renders default title and new-chat controls', () => {
    const { container } = render(
      <SidebarProvider>
        <AppSidebar activeChatId={null} onNewChat={noop} onSelect={noopId} />
      </SidebarProvider>
    )
    expect(container.textContent).toContain('agent')
    expect(container.textContent?.toLowerCase()).toContain('new chat')
  })
  test('honors custom title prop', () => {
    const { container } = render(
      <SidebarProvider>
        <AppSidebar activeChatId={null} onNewChat={noop} onSelect={noopId} title='my-app' />
      </SidebarProvider>
    )
    expect(container.textContent).toContain('my-app')
  })
  test('new-chat button fires callback', () => {
    let called = 0
    const onNewChat = (): void => {
      called += 1
    }
    const { container } = render(
      <SidebarProvider>
        <AppSidebar activeChatId={null} onNewChat={onNewChat} onSelect={noopId} />
      </SidebarProvider>
    )
    const btn = container.querySelector('button[aria-label="new chat"]')
    if (!btn) throw new Error('no new-chat button')
    fireEvent.click(btn)
    expect(called).toBe(1)
  })
  test('connection dot reflects auth', () => {
    const { container } = render(
      <SidebarProvider>
        <AppSidebar activeChatId={null} onNewChat={noop} onSelect={noopId} />
      </SidebarProvider>
    )
    const dot = container.querySelector('[role="status"]')
    expect(dot?.getAttribute('aria-label')).toContain('Connected')
  })
})
