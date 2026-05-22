/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import type { Id } from 'backend/convex/_generated/dataModel'
import { resetFakeConvex, setFakeStore } from '@a/react/test-utils/fake-convex'
import { render } from '@a/react/test-utils/render'
import { SidebarProvider } from '@a/ui/components/sidebar'
import { beforeEach, describe, expect, test } from 'bun:test'
import { SidebarHistory } from './sidebar-history'

const noop = (): void => {
  /* Empty */
}
const DAY = 24 * 60 * 60 * 1000
const withSidebar = (ui: React.ReactElement): React.ReactElement => <SidebarProvider>{ui}</SidebarProvider>
beforeEach(() => {
  resetFakeConvex()
  try {
    globalThis.localStorage.clear()
  } catch {
    /* Jsdom may not support */
  }
})
describe('SidebarHistory', () => {
  test('shows spinner while chats query pending (undefined)', () => {
    setFakeStore({ chatList: undefined })
    const { container } = render(withSidebar(<SidebarHistory activeChatId={null} onSelect={noop} />))
    expect(container.querySelector('[role="status"], svg')).toBeTruthy()
  })
  test('shows empty state when chats.length = 0', () => {
    const { container } = render(withSidebar(<SidebarHistory activeChatId={null} onSelect={noop} />))
    expect(container.textContent?.toLowerCase()).toContain('no chats')
  })
  test('groups chats by Today / Yesterday / Previous 7 days / Older', () => {
    const now = Date.now()
    setFakeStore({
      chatList: [
        { _id: 'a', title: 'today chat', updatedAt: now - 1000 },
        { _id: 'b', title: 'yesterday chat', updatedAt: now - DAY - 1000 },
        { _id: 'c', title: 'week-ago chat', updatedAt: now - 4 * DAY },
        { _id: 'd', title: 'older chat', updatedAt: now - 30 * DAY }
      ] as never
    })
    const { container } = render(withSidebar(<SidebarHistory activeChatId={'a' as Id<'chats'>} onSelect={noop} />))
    expect(container.textContent).toContain('Today')
    expect(container.textContent).toContain('Yesterday')
    expect(container.textContent).toContain('Previous 7 days')
    expect(container.textContent).toContain('Older')
    expect(container.textContent).toContain('today chat')
    expect(container.textContent).toContain('older chat')
  })
})
