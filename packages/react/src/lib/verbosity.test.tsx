import { act, fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, test } from 'bun:test'
import { useVerbosity, VerbosityProvider } from './verbosity'

const Probe = () => {
  const { mode, toggle } = useVerbosity()
  return (
    <button onClick={toggle} type='button'>
      {mode}
    </button>
  )
}
beforeEach(() => {
  globalThis.localStorage.clear()
})
describe('VerbosityProvider', () => {
  test('default mode is clean', () => {
    const { container } = render(
      <VerbosityProvider>
        <Probe />
      </VerbosityProvider>
    )
    expect(container.textContent).toBe('clean')
  })
  test('toggle switches to debug', () => {
    const { container } = render(
      <VerbosityProvider>
        <Probe />
      </VerbosityProvider>
    )
    const btn = container.querySelector('button')
    if (!btn) throw new Error('no btn')
    act(() => {
      fireEvent.click(btn)
    })
    expect(container.textContent).toBe('debug')
  })
  test('reads initial from localStorage', () => {
    globalThis.localStorage.setItem('verbosity-mode', 'debug')
    const { container } = render(
      <VerbosityProvider>
        <Probe />
      </VerbosityProvider>
    )
    expect(container.textContent).toBe('debug')
  })
  test('⌘. toggles mode', () => {
    const { container } = render(
      <VerbosityProvider>
        <Probe />
      </VerbosityProvider>
    )
    act(() => {
      fireEvent.keyDown(globalThis.window, { key: '.', metaKey: true })
    })
    expect(container.textContent).toBe('debug')
  })
})
