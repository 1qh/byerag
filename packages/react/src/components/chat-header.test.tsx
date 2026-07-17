import { SidebarProvider } from '@a/ui/components/sidebar'
import { render } from '@testing-library/react'
import { describe, expect, test } from 'bun:test'
import { ChatHeader } from './chat-header'

describe('ChatHeader', () => {
  test('returns null on desktop (no mobile)', () => {
    const { container } = render(
      <SidebarProvider>
        <ChatHeader chatId='c1' />
      </SidebarProvider>
    )
    expect(container.querySelector('header')).toBeNull()
  })
})
