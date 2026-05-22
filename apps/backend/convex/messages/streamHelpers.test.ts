import { describe, expect, test } from 'bun:test'
import type { UsageReport } from './streamHelpers'
import { boundedBody, computeActualCents, sseCostTap, withCancelHook } from './streamHelpers'

const enc = new TextEncoder()
const streamFromChunks = (chunks: (string | Uint8Array)[]): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>({
    start: controller => {
      for (const c of chunks) controller.enqueue(typeof c === 'string' ? enc.encode(c) : c)
      controller.close()
    }
  })
const streamFromAsync = (gen: AsyncGenerator<Uint8Array>): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>({
    pull: async controller => {
      const { value, done } = await gen.next()
      if (done) controller.close()
      else controller.enqueue(value)
    }
  })
const collectText = async (stream: ReadableStream<Uint8Array>): Promise<string> => {
  const reader = stream.getReader()
  const dec = new TextDecoder()
  let out = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) return out
    out += dec.decode(value, { stream: true })
  }
}
const collectErr = async (stream: ReadableStream<Uint8Array>): Promise<{ error: null | string; text: string }> => {
  const reader = stream.getReader()
  const dec = new TextDecoder()
  let text = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) return { error: null, text }
      text += dec.decode(value, { stream: true })
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'unknown', text }
  }
}
describe('computeActualCents', () => {
  test('uses model rates for opus', () => {
    const u: UsageReport = {
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      inputTokens: 1_000_000,
      model: 'claude-opus-4-7',
      outputTokens: 1_000_000
    }
    expect(computeActualCents(u)).toBe(1500 + 7500)
  })
  test('uses default rates for unknown model', () => {
    const u: UsageReport = {
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      inputTokens: 1_000_000,
      model: 'gpt-9000',
      outputTokens: 1_000_000
    }
    expect(computeActualCents(u)).toBe(300 + 1500)
  })
  test('cache_creation 1.25x premium, cache_read 0.1x', () => {
    const u: UsageReport = {
      cacheCreationInputTokens: 1_000_000,
      cacheReadInputTokens: 1_000_000,
      inputTokens: 0,
      model: 'claude-sonnet-4-6',
      outputTokens: 0
    }
    expect(computeActualCents(u)).toBe(375 + 30)
  })
  test('zero usage returns 0', () => {
    expect(
      computeActualCents({ cacheCreationInputTokens: 0, cacheReadInputTokens: 0, inputTokens: 0, outputTokens: 0 })
    ).toBe(0)
  })
})
describe('sseCostTap', () => {
  test('parses message_start usage', async () => {
    let captured: null | UsageReport = null
    const onUsage = async (u: UsageReport): Promise<void> => {
      captured = u
    }
    const frame = JSON.stringify({
      message: {
        model: 'claude-sonnet-4-6',
        usage: { cache_creation_input_tokens: 5, cache_read_input_tokens: 7, input_tokens: 100, output_tokens: 1 }
      },
      type: 'message_start'
    })
    const src = streamFromChunks([`data: ${frame}\n\n`])
    const tap = sseCostTap(src, onUsage)
    await collectText(tap.body)
    expect(tap.hasUsage()).toBe(true)
    expect(captured).not.toBeNull()
    expect(captured?.inputTokens).toBe(100)
    expect(captured?.outputTokens).toBe(1)
    expect(captured?.cacheCreationInputTokens).toBe(5)
    expect(captured?.cacheReadInputTokens).toBe(7)
    expect(captured?.model).toBe('claude-sonnet-4-6')
  })
  test('message_delta updates output cumulatively via Math.max', async () => {
    let captured: null | UsageReport = null
    const onUsage = async (u: UsageReport): Promise<void> => {
      captured = u
    }
    const start = JSON.stringify({
      message: { model: 'claude-sonnet-4-6', usage: { input_tokens: 50, output_tokens: 1 } },
      type: 'message_start'
    })
    const delta1 = JSON.stringify({ type: 'message_delta', usage: { output_tokens: 25 } })
    const delta2 = JSON.stringify({ type: 'message_delta', usage: { output_tokens: 80 } })
    const delta3 = JSON.stringify({ type: 'message_delta', usage: { output_tokens: 60 } })
    const src = streamFromChunks([
      `data: ${start}\n\n`,
      `data: ${delta1}\n\n`,
      `data: ${delta2}\n\n`,
      `data: ${delta3}\n\n`
    ])
    const tap = sseCostTap(src, onUsage)
    await collectText(tap.body)
    expect(captured?.outputTokens).toBe(80)
  })
  test('message_delta updates cache tokens via Math.max', async () => {
    let captured: null | UsageReport = null
    const onUsage = async (u: UsageReport): Promise<void> => {
      captured = u
    }
    const start = JSON.stringify({
      message: {
        model: 'claude-sonnet-4-6',
        usage: { cache_creation_input_tokens: 10, cache_read_input_tokens: 20, input_tokens: 0, output_tokens: 0 }
      },
      type: 'message_start'
    })
    const delta = JSON.stringify({
      type: 'message_delta',
      usage: { cache_creation_input_tokens: 50, cache_read_input_tokens: 100, output_tokens: 5 }
    })
    const src = streamFromChunks([`data: ${start}\n\n`, `data: ${delta}\n\n`])
    const tap = sseCostTap(src, onUsage)
    await collectText(tap.body)
    expect(captured?.cacheCreationInputTokens).toBe(50)
    expect(captured?.cacheReadInputTokens).toBe(100)
  })
  test('hasUsage false on stream without message_start', async () => {
    let invoked = false
    const onUsage = async (): Promise<void> => {
      invoked = true
    }
    const src = streamFromChunks(['event: error\ndata: {"error":"upstream 500"}\n\n'])
    const tap = sseCostTap(src, onUsage)
    await collectText(tap.body)
    expect(invoked).toBe(true)
    expect(tap.hasUsage()).toBe(false)
    expect(tap.getUsage().inputTokens).toBe(0)
  })
  test('handles chunk boundary mid-frame', async () => {
    let captured: null | UsageReport = null
    const onUsage = async (u: UsageReport): Promise<void> => {
      captured = u
    }
    const frame = JSON.stringify({
      message: { model: 'claude-sonnet-4-6', usage: { input_tokens: 42, output_tokens: 1 } },
      type: 'message_start'
    })
    const wire = `data: ${frame}\n\n`
    const mid = Math.floor(wire.length / 2)
    const src = streamFromChunks([wire.slice(0, mid), wire.slice(mid)])
    const tap = sseCostTap(src, onUsage)
    await collectText(tap.body)
    expect(captured?.inputTokens).toBe(42)
  })
  test('ignores malformed JSON frames gracefully', async () => {
    let invoked = false
    const onUsage = async (): Promise<void> => {
      invoked = true
    }
    const src = streamFromChunks(['data: {not json\n\n', 'data: also-bad\n\n'])
    const tap = sseCostTap(src, onUsage)
    await collectText(tap.body)
    expect(invoked).toBe(true)
    expect(tap.hasUsage()).toBe(false)
  })
  test('passes bytes through unchanged', async () => {
    const onUsage = async (): Promise<void> => undefined
    const src = streamFromChunks(['hello ', 'world\n\n'])
    const tap = sseCostTap(src, onUsage)
    expect(await collectText(tap.body)).toBe('hello world\n\n')
  })
})
describe('boundedBody', () => {
  test('null body returns null', () => {
    expect(boundedBody(null, 100)).toBeNull()
  })
  test('passes bytes within cap, fires onClose on flush', async () => {
    let closed = false
    const stream = boundedBody(streamFromChunks(['abc', 'def']), 100, {
      onClose: () => {
        closed = true
      }
    })
    expect(stream).not.toBeNull()
    if (!stream) return
    expect(await collectText(stream)).toBe('abcdef')
    expect(closed).toBe(true)
  })
  test('fires onExceed and onAbort when body exceeds cap', async () => {
    let exceed = false
    let abort = false
    const stream = boundedBody(streamFromChunks(['abcdefghij']), 5, {
      onAbort: () => {
        abort = true
      },
      onExceed: () => {
        exceed = true
      }
    })
    if (!stream) throw new Error('null stream')
    const { error } = await collectErr(stream)
    expect(error).toBe('body too large')
    expect(exceed).toBe(true)
    expect(abort).toBe(true)
  })
  test('idle timer fires onAbort when no chunk arrives', async () => {
    let aborted = false
    const stalledSource = new ReadableStream<Uint8Array>({
      start: () => undefined
    })
    const stream = boundedBody(stalledSource, 1024, {
      idleMs: 30,
      onAbort: () => {
        aborted = true
      },
      sse: true
    })
    if (!stream) throw new Error('null stream')
    const { error } = await collectErr(stream)
    expect(error).toBe('upstream idle')
    expect(aborted).toBe(true)
  })
  test('idle timer is rearmed on each chunk', async () => {
    let aborted = false
    let i = 0
    const gen = (async function* genFn(): AsyncGenerator<Uint8Array> {
      while (i < 3) {
        await new Promise<void>(r => {
          setTimeout(r, 20)
        })
        yield enc.encode(`chunk${i}|`)
        i += 1
      }
    })()
    const stream = boundedBody(streamFromAsync(gen), 1024, {
      idleMs: 80,
      onAbort: () => {
        aborted = true
      }
    })
    if (!stream) throw new Error('null stream')
    expect(await collectText(stream)).toBe('chunk0|chunk1|chunk2|')
    expect(aborted).toBe(false)
  })
})
describe('withCancelHook', () => {
  test('cancel propagates onCancel and reader.cancel', async () => {
    let cancelled = false
    let upstreamCancelled = false
    const upstream = new ReadableStream<Uint8Array>({
      cancel: () => {
        upstreamCancelled = true
      },
      start: controller => {
        controller.enqueue(enc.encode('partial'))
      }
    })
    const wrapped = withCancelHook(upstream, () => {
      cancelled = true
    })
    const reader = wrapped.getReader()
    const first = await reader.read()
    expect(first.done).toBe(false)
    await reader.cancel('client done')
    expect(cancelled).toBe(true)
    expect(upstreamCancelled).toBe(true)
  })
  test('upstream error fires onCancel', async () => {
    let cancelled = false
    const upstream = new ReadableStream<Uint8Array>({
      pull: controller => {
        controller.error(new Error('upstream blew up'))
      }
    })
    const wrapped = withCancelHook(upstream, () => {
      cancelled = true
    })
    const { error } = await collectErr(wrapped)
    expect(error).toBe('upstream blew up')
    expect(cancelled).toBe(true)
  })
  test('graceful close does not call onCancel', async () => {
    let cancelled = false
    const upstream = streamFromChunks(['hello'])
    const wrapped = withCancelHook(upstream, () => {
      cancelled = true
    })
    expect(await collectText(wrapped)).toBe('hello')
    expect(cancelled).toBe(false)
  })
})
