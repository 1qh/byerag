import { fireEvent, render } from '@testing-library/react'
import { describe, expect, test } from 'bun:test'
import { useShortcuts } from './use-shortcuts'
const Probe = ({ onNewChat, onNext, onPrev }: { onNewChat: () => void; onNext: () => void; onPrev: () => void }) => {
  useShortcuts({ newChat: onNewChat, nextChat: onNext, prevChat: onPrev })
  return null
}
describe('useShortcuts', () => {
  test('⌘N calls newChat', () => {
    let called = 0
    render(
      <Probe
        onNewChat={() => {
          called += 1
        }}
        onNext={() => undefined}
        onPrev={() => undefined}
      />
    )
    fireEvent.keyDown(globalThis.window, { key: 'n', metaKey: true })
    expect(called).toBe(1)
  })
  test('⌘] calls nextChat', () => {
    let called = 0
    render(
      <Probe
        onNewChat={() => undefined}
        onNext={() => {
          called += 1
        }}
        onPrev={() => undefined}
      />
    )
    fireEvent.keyDown(globalThis.window, { key: ']', metaKey: true })
    expect(called).toBe(1)
  })
  test('⌘[ calls prevChat', () => {
    let called = 0
    render(
      <Probe
        onNewChat={() => undefined}
        onNext={() => undefined}
        onPrev={() => {
          called += 1
        }}
      />
    )
    fireEvent.keyDown(globalThis.window, { key: '[', metaKey: true })
    expect(called).toBe(1)
  })
  test('ignores ⌘N when no modifier', () => {
    let called = 0
    render(
      <Probe
        onNewChat={() => {
          called += 1
        }}
        onNext={() => undefined}
        onPrev={() => undefined}
      />
    )
    fireEvent.keyDown(globalThis.window, { key: 'n' })
    expect(called).toBe(0)
  })
})
