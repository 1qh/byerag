import { render } from '@testing-library/react'
import { describe, expect, test } from 'bun:test'
import { SidebarUserNav } from './sidebar-user-nav'

describe('SidebarUserNav', () => {
  test('renders display name from name', () => {
    const { container } = render(<SidebarUserNav user={{ email: 'a@b.com', name: 'Alice Smith' }} />)
    expect(container.textContent).toContain('Alice Smith')
    expect(container.textContent).toContain('a@b.com')
  })
  test('falls back to email when name missing', () => {
    const { container } = render(<SidebarUserNav user={{ email: 'x@y.com' }} />)
    expect(container.textContent).toContain('x@y.com')
  })
  test('falls back to "User" when both missing', () => {
    const { container } = render(<SidebarUserNav user={{}} />)
    expect(container.textContent).toContain('User')
  })
  test('renders initials from name', () => {
    const { container } = render(<SidebarUserNav user={{ name: 'Alice Smith' }} />)
    expect(container.textContent).toContain('AS')
  })
})
