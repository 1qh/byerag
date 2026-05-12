/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'bun:test'
import { FileBrowser } from './file-browser'
afterEach(() => {
  cleanup()
})
describe('FileBrowser', () => {
  test('renders loading state initially', () => {
    const { container } = render(<FileBrowser />)
    expect(container.textContent?.toLowerCase()).toContain('loading')
  })
})
