/* oxlint-disable react-perf/jsx-no-new-array-as-prop */
/* eslint-disable @typescript-eslint/unbound-method */
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, test } from 'bun:test'
import { ExportChat } from './export-chat'

const userEvt = (text: string) => ({
  _creationTime: 1,
  _id: 'u',
  content: JSON.stringify({ message: { content: [{ text, type: 'text' }], role: 'user' }, type: 'user' })
})
const assistantEvt = (text: string) => ({
  _creationTime: 2,
  _id: 'a',
  content: JSON.stringify({ message: { content: [{ text, type: 'text' }], role: 'assistant' }, type: 'assistant' })
})
describe('ExportChat', () => {
  test('renders download button', () => {
    const { container } = render(<ExportChat events={[userEvt('hi'), assistantEvt('hello')]} title='Test chat' />)
    const btn = container.querySelector('button')
    expect(btn).toBeTruthy()
  })
  test('hidden when no events', () => {
    const { container } = render(<ExportChat events={[]} title='empty' />)
    expect(container.querySelector('button')).toBe(null)
  })
  test('click triggers a download (URL.createObjectURL called)', () => {
    const calls: Blob[] = []
    const originalCreate = globalThis.URL.createObjectURL
    const originalRevoke = globalThis.URL.revokeObjectURL
    globalThis.URL.createObjectURL = (b: Blob): string => {
      calls.push(b)
      return 'blob:mock'
    }
    globalThis.URL.revokeObjectURL = (): void => {
      /* Empty */
    }
    try {
      const { container } = render(<ExportChat events={[userEvt('hi'), assistantEvt('ok')]} title='T' />)
      const btn = container.querySelector('button')
      if (!btn) throw new Error('no button')
      fireEvent.click(btn)
      expect(calls.length).toBe(1)
    } finally {
      globalThis.URL.createObjectURL = originalCreate
      globalThis.URL.revokeObjectURL = originalRevoke
    }
  })
})
