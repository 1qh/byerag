import { fireEvent, render } from '@testing-library/react'
import { describe, expect, mock, test } from 'bun:test'
import { MultimodalInput } from './multimodal-input'

const noop = (): void => {
  /* Empty */
}
const NO_ATTACHMENTS: never[] = []
describe('MultimodalInput', () => {
  test('renders a textarea bound to value prop', () => {
    const { container } = render(
      <MultimodalInput
        attachments={NO_ATTACHMENTS}
        hasMessages={false}
        onAttachmentsChange={noop}
        onChange={noop}
        onSubmit={noop}
        status='ready'
        value='draft text'
      />
    )
    const ta = container.querySelector('textarea')
    expect(ta?.value).toBe('draft text')
  })
  test('onChange fires when typing', () => {
    const onChange = mock(noop)
    const { container } = render(
      <MultimodalInput
        attachments={NO_ATTACHMENTS}
        hasMessages={false}
        onAttachmentsChange={noop}
        onChange={onChange}
        onSubmit={noop}
        status='ready'
        value=''
      />
    )
    const ta = container.querySelector('textarea')
    if (!ta) throw new Error('textarea not found')
    fireEvent.change(ta, { target: { value: 'hello' } })
    expect(onChange).toHaveBeenCalledWith('hello')
  })
  test('submit button disabled when value empty', () => {
    const { container } = render(
      <MultimodalInput
        attachments={NO_ATTACHMENTS}
        hasMessages={false}
        onAttachmentsChange={noop}
        onChange={noop}
        onSubmit={noop}
        status='ready'
        value=''
      />
    )
    const btn = container.querySelector('button[type="submit"]') ?? container.querySelector('button')
    expect((btn as HTMLButtonElement).disabled).toBe(true)
  })
  test('submit button enabled when value non-empty and status=ready', () => {
    const { container } = render(
      <MultimodalInput
        attachments={NO_ATTACHMENTS}
        hasMessages={false}
        onAttachmentsChange={noop}
        onChange={noop}
        onSubmit={noop}
        status='ready'
        value='hi'
      />
    )
    const btn = container.querySelector('button[type="submit"]') ?? container.querySelector('button')
    expect((btn as HTMLButtonElement).disabled).toBe(false)
  })
  test('submit button disabled while streaming even if value present', () => {
    const { container } = render(
      <MultimodalInput
        attachments={NO_ATTACHMENTS}
        hasMessages
        onAttachmentsChange={noop}
        onChange={noop}
        onSubmit={noop}
        status='streaming'
        value='hi'
      />
    )
    const btn = container.querySelector('button[type="submit"]') ?? container.querySelector('button')
    expect((btn as HTMLButtonElement).disabled).toBe(true)
  })
})
