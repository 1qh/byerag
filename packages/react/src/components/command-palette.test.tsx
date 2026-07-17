import type { ReactElement } from 'react'
import { VerbosityProvider } from '@a/react/lib'
import { render } from '@a/react/test-utils/render'
import { cleanup } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'bun:test'
import { CommandPalette } from './command-palette'

const wrap = (ui: ReactElement): ReactElement => <VerbosityProvider>{ui}</VerbosityProvider>
const noop = (): void => {
  /* Empty */
}
const noopId = (): void => {
  /* Empty */
}
afterEach(() => {
  cleanup()
})
describe('CommandPalette', () => {
  test('closed by default (no dialog in body)', () => {
    render(wrap(<CommandPalette onCreate={noop} onSelect={noopId} />))
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })
})
