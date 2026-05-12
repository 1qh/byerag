/* oxlint-disable eslint-plugin-react-perf(jsx-no-new-array-as-prop), react-perf/jsx-no-new-array-as-prop, react-perf/jsx-no-new-object-as-prop */
import { render } from '@testing-library/react'
import { describe, expect, test } from 'bun:test'
import { DebugPanel } from './debug-panel'
const evt = (content: unknown, creationTime: number): { _creationTime: number; content: string } => ({
  _creationTime: creationTime,
  content: JSON.stringify(content)
})
describe('DebugPanel', () => {
  test('returns null when no parseable events', () => {
    const { container } = render(<DebugPanel events={[]} sendTime={null} />)
    expect(container.textContent).toBe('')
  })
  test('shows event count, model from system/init', () => {
    const events = [
      evt(
        {
          apiKeySource: 'env',
          claude_code_version: '1.0',
          cwd: '/',
          model: 'claude-x',
          permissionMode: 'bypassPermissions',
          session_id: 'sid',
          subtype: 'init',
          tools: [],
          type: 'system',
          uuid: 'u1'
        },
        1
      ),
      evt(
        {
          message: { content: [{ text: 'hi', type: 'text' }], role: 'assistant', usage: { output_tokens: 10 } },
          type: 'assistant',
          uuid: 'u2'
        },
        2
      ),
      evt(
        {
          duration_ms: 100,
          is_error: false,
          num_turns: 1,
          result: { cost_usd: 0.01 },
          subtype: 'success',
          type: 'result'
        },
        3
      )
    ]
    const { container } = render(<DebugPanel events={events} sendTime={null} />)
    expect(container.textContent).toContain('3 events')
    expect(container.textContent).toContain('claude-x')
  })
  test('shows tokens in/out/cache ratio', () => {
    const events = [
      evt(
        {
          message: {
            content: [],
            role: 'assistant',
            usage: { cache_read_input_tokens: 50, input_tokens: 100, output_tokens: 20 }
          },
          type: 'assistant',
          uuid: 'u1'
        },
        1
      )
    ]
    const { container } = render(<DebugPanel events={events} sendTime={null} />)
    expect(container.textContent).toMatch(/150in/u)
    expect(container.textContent).toMatch(/20out/u)
  })
})
