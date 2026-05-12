/* oxlint-disable eslint(no-await-in-loop) */
import { describe, expect, test } from 'bun:test'
import type { UsageReport } from './streamHelpers'
import { sseCostTap } from './streamHelpers'
const enc = new TextEncoder()
const streamFromBytes = (bytes: Uint8Array, chunkSize = 32): ReadableStream<Uint8Array> => {
  let offset = 0
  return new ReadableStream<Uint8Array>({
    pull: controller => {
      if (offset >= bytes.byteLength) {
        controller.close()
        return
      }
      const end = Math.min(offset + chunkSize, bytes.byteLength)
      controller.enqueue(bytes.slice(offset, end))
      offset = end
    }
  })
}
const collect = async (stream: ReadableStream<Uint8Array>): Promise<string> => {
  const reader = stream.getReader()
  const dec = new TextDecoder()
  let out = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) return out
    out += dec.decode(value, { stream: true })
  }
}
const runTap = async (
  wire: string,
  chunkSize = 32
): Promise<{ flushUsage: null | UsageReport; getUsage: UsageReport; hasUsage: boolean; passthrough: string }> => {
  let flushUsage: null | UsageReport = null
  const onUsage = async (u: UsageReport): Promise<void> => {
    flushUsage = { ...u }
  }
  const tap = sseCostTap(streamFromBytes(enc.encode(wire), chunkSize), onUsage)
  const passthrough = await collect(tap.body)
  return { flushUsage, getUsage: tap.getUsage(), hasUsage: tap.hasUsage(), passthrough }
}
interface StartArgs {
  cacheCreate?: number
  cacheRead?: number
  input?: number
  model: string
  output?: number
}
const startFrame = ({ model, input = 100, output = 1, cacheCreate = 0, cacheRead = 0 }: StartArgs): string =>
  `event: message_start\ndata: ${JSON.stringify({
    message: {
      model,
      usage: {
        cache_creation_input_tokens: cacheCreate,
        cache_read_input_tokens: cacheRead,
        input_tokens: input,
        output_tokens: output
      }
    },
    type: 'message_start'
  })}\n\n`
const deltaFrame = (output: number): string =>
  `event: message_delta\ndata: ${JSON.stringify({ type: 'message_delta', usage: { output_tokens: output } })}\n\n`
describe('sseCostTap replay: real-shaped frames', () => {
  test('replays a complete normal turn (start + n deltas + stop)', async () => {
    const wire = [
      startFrame({ input: 1234, model: 'claude-sonnet-4-6', output: 1 }),
      deltaFrame(50),
      deltaFrame(100),
      deltaFrame(150),
      `event: message_stop\ndata: {"type":"message_stop"}\n\n`
    ].join('')
    const r = await runTap(wire)
    expect(r.hasUsage).toBe(true)
    expect(r.getUsage.inputTokens).toBe(1234)
    expect(r.getUsage.outputTokens).toBe(150)
    expect(r.passthrough).toContain('message_stop')
  })
  test('handles tiny chunkSize (1 byte) — buffer stitches every frame', async () => {
    const wire = startFrame({ input: 42, model: 'claude-sonnet-4-6', output: 1 }) + deltaFrame(99)
    const r = await runTap(wire, 1)
    expect(r.getUsage.inputTokens).toBe(42)
    expect(r.getUsage.outputTokens).toBe(99)
  })
  test('handles oversized chunkSize (whole stream in one chunk)', async () => {
    const wire = startFrame({ input: 42, model: 'claude-sonnet-4-6', output: 1 }) + deltaFrame(99)
    const r = await runTap(wire, 10_000)
    expect(r.getUsage.inputTokens).toBe(42)
    expect(r.getUsage.outputTokens).toBe(99)
  })
  test('multi-data-line frame is concatenated for parsing', async () => {
    const start = JSON.stringify({
      message: { model: 'claude-sonnet-4-6', usage: { input_tokens: 7, output_tokens: 1 } },
      type: 'message_start'
    })
    const half = Math.floor(start.length / 2)
    const wire = `event: message_start\ndata: ${start.slice(0, half)}\ndata: ${start.slice(half)}\n\n`
    const r = await runTap(wire)
    expect(r.hasUsage).toBe(false)
  })
  test('event-without-data is silently ignored', async () => {
    const wire = `event: ping\n\n${startFrame({ input: 100, model: 'claude-sonnet-4-6', output: 1 })}`
    const r = await runTap(wire)
    expect(r.hasUsage).toBe(true)
    expect(r.getUsage.inputTokens).toBe(100)
  })
  test('comment lines (starting with :) are ignored', async () => {
    const wire = `: keepalive\n\n${startFrame({ input: 100, model: 'claude-sonnet-4-6', output: 1 })}`
    const r = await runTap(wire)
    expect(r.getUsage.inputTokens).toBe(100)
  })
  test(String.raw`CRLF line endings are tolerated where parser splits on \n`, async () => {
    const wire = `event: message_start\r\ndata: ${JSON.stringify({
      message: { model: 'claude-sonnet-4-6', usage: { input_tokens: 1, output_tokens: 1 } },
      type: 'message_start'
    })}\r\n\r\n`
    const r = await runTap(wire)
    expect(r.hasUsage).toBe(false)
  })
  test(String.raw`partial last frame without trailing \n\n is silently dropped (no usage)`, async () => {
    const wire = `event: message_start\ndata: ${JSON.stringify({
      message: { model: 'claude-sonnet-4-6', usage: { input_tokens: 999, output_tokens: 1 } },
      type: 'message_start'
    })}\n`
    const r = await runTap(wire)
    expect(r.hasUsage).toBe(false)
  })
  test('extremely long delta chain (1000 frames) accumulates monotonically', async () => {
    const frames = [startFrame({ input: 100, model: 'claude-sonnet-4-6', output: 1 })]
    for (let i = 1; i <= 1000; i += 1) frames.push(deltaFrame(i))
    const r = await runTap(frames.join(''))
    expect(r.getUsage.outputTokens).toBe(1000)
  })
  test('delta with smaller output than current does not regress (Math.max)', async () => {
    const wire = [
      startFrame({ input: 100, model: 'claude-sonnet-4-6', output: 1 }),
      deltaFrame(500),
      deltaFrame(200),
      deltaFrame(300)
    ].join('')
    const r = await runTap(wire)
    expect(r.getUsage.outputTokens).toBe(500)
  })
  test('frame with cache_creation_input_tokens in message_delta updates via Math.max', async () => {
    const wire = [
      startFrame({ cacheCreate: 50, cacheRead: 0, input: 100, model: 'claude-sonnet-4-6', output: 1 }),
      `event: message_delta\ndata: ${JSON.stringify({
        type: 'message_delta',
        usage: { cache_creation_input_tokens: 200, output_tokens: 5 }
      })}\n\n`
    ].join('')
    const r = await runTap(wire)
    expect(r.getUsage.cacheCreationInputTokens).toBe(200)
  })
  test('passthrough stream byte-for-byte equals input', async () => {
    const wire = `${startFrame({ input: 100, model: 'claude-sonnet-4-6', output: 1 })}data: foo\n\n${deltaFrame(50)}`
    const r = await runTap(wire)
    expect(r.passthrough).toBe(wire)
  })
  test('flush callback fires exactly once on graceful close', async () => {
    let calls = 0
    let captured: null | UsageReport = null
    const onUsage = async (u: UsageReport): Promise<void> => {
      calls += 1
      captured = { ...u }
    }
    const wire = startFrame({ input: 100, model: 'claude-sonnet-4-6', output: 1 }) + deltaFrame(42)
    const tap = sseCostTap(streamFromBytes(enc.encode(wire)), onUsage)
    await collect(tap.body)
    expect(calls).toBe(1)
    expect(captured?.outputTokens).toBe(42)
  })
  test('non-Anthropic JSON frame is ignored', async () => {
    const wire = `data: ${JSON.stringify({ random: 'thing' })}\n\n${startFrame({ input: 99, model: 'claude-sonnet-4-6', output: 1 })}`
    const r = await runTap(wire)
    expect(r.getUsage.inputTokens).toBe(99)
  })
})
