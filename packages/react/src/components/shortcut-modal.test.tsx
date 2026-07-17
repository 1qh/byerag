import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'bun:test'
import { ShortcutModal } from './shortcut-modal'

afterEach(() => {
  cleanup()
})
describe('ShortcutModal', () => {
  test('closed by default', () => {
    render(<ShortcutModal />)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })
  test('opens on ? key', () => {
    render(<ShortcutModal />)
    fireEvent.keyDown(globalThis.window, { key: '?' })
    expect(document.querySelector('[role="dialog"]')).toBeTruthy()
    expect(document.body.textContent).toContain('Keyboard shortcuts')
  })
  test('ignores ? when metaKey pressed', () => {
    render(<ShortcutModal />)
    fireEvent.keyDown(globalThis.window, { key: '?', metaKey: true })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })
})
