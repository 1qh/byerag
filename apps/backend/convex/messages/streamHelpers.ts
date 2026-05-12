interface ModelRates {
  inputUSDPerMtok: number
  outputUSDPerMtok: number
}
const MODEL_RATES: Record<string, ModelRates> = {
  'claude-haiku-4-5': { inputUSDPerMtok: 1, outputUSDPerMtok: 5 },
  'claude-haiku-4-5-20251001': { inputUSDPerMtok: 1, outputUSDPerMtok: 5 },
  'claude-opus-4-7': { inputUSDPerMtok: 15, outputUSDPerMtok: 75 },
  'claude-sonnet-4-6': { inputUSDPerMtok: 3, outputUSDPerMtok: 15 }
}
const DEFAULT_RATES: ModelRates = { inputUSDPerMtok: 3, outputUSDPerMtok: 15 }
interface UsageReport {
  cacheCreationInputTokens: number
  cacheReadInputTokens: number
  inputTokens: number
  model?: string
  outputTokens: number
}
const computeActualCents = (u: UsageReport): number => {
  const r = u.model ? (MODEL_RATES[u.model] ?? DEFAULT_RATES) : DEFAULT_RATES
  const input = (u.inputTokens * r.inputUSDPerMtok * 100) / 1_000_000
  const cacheCreate = (u.cacheCreationInputTokens * r.inputUSDPerMtok * 1.25 * 100) / 1_000_000
  const cacheRead = (u.cacheReadInputTokens * r.inputUSDPerMtok * 0.1 * 100) / 1_000_000
  const output = (u.outputTokens * r.outputUSDPerMtok * 100) / 1_000_000
  return Math.ceil(input + cacheCreate + cacheRead + output)
}
interface BoundedBodyOpts {
  idleMs?: number
  onAbort?: () => void
  onClose?: () => void
  onExceed?: () => void
  sse?: boolean
}
const boundedBody = (
  body: null | ReadableStream<Uint8Array>,
  max: number,
  opts?: BoundedBodyOpts
): null | ReadableStream<Uint8Array> => {
  if (!body) return null
  let seen = 0
  let idleTimer: null | ReturnType<typeof setTimeout> = null
  const armIdle = (ctrl: TransformStreamDefaultController<Uint8Array>): void => {
    if (!opts?.idleMs) return
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      if (opts.sse)
        try {
          ctrl.enqueue(new TextEncoder().encode('event: error\ndata: {"error":"upstream idle"}\n\n'))
        } catch {
          /* Already terminated */
        }
      opts.onAbort?.()
      ctrl.error(new Error('upstream idle'))
    }, opts.idleMs)
  }
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      flush: () => {
        if (idleTimer) clearTimeout(idleTimer)
        opts?.onClose?.()
      },
      start: ctrl => armIdle(ctrl),
      transform: (chunk, controller) => {
        seen += chunk.byteLength
        if (seen > max) {
          if (idleTimer) clearTimeout(idleTimer)
          opts?.onExceed?.()
          opts?.onAbort?.()
          controller.error(new Error('body too large'))
          return
        }
        controller.enqueue(chunk)
        armIdle(controller)
      }
    })
  )
}
const withCancelHook = (src: ReadableStream<Uint8Array>, onCancel: () => void): ReadableStream<Uint8Array> => {
  const reader = src.getReader()
  return new ReadableStream<Uint8Array>({
    cancel: async reason => {
      onCancel()
      try {
        await reader.cancel(reason)
      } catch {
        /* Already torn down */
      }
    },
    pull: async controller => {
      try {
        const { value, done } = await reader.read()
        if (done) controller.close()
        else controller.enqueue(value)
      } catch (error) {
        onCancel()
        controller.error(error)
      }
    }
  })
}
interface SseTap {
  body: ReadableStream<Uint8Array>
  getUsage: () => UsageReport
  hasUsage: () => boolean
}
const sseCostTap = (body: ReadableStream<Uint8Array>, onUsage: (usage: UsageReport) => Promise<void>): SseTap => {
  let buffer = ''
  let sawUsage = false
  const usage: UsageReport = { cacheCreationInputTokens: 0, cacheReadInputTokens: 0, inputTokens: 0, outputTokens: 0 }
  const decoder = new TextDecoder()
  const parseEvent = (frame: string): void => {
    const lines = frame.split('\n')
    const dataLines = lines.filter(l => l.startsWith('data: ')).map(l => l.slice(6))
    if (dataLines.length === 0) return
    try {
      const obj = JSON.parse(dataLines.join('\n')) as {
        message?: {
          model?: string
          usage?: {
            cache_creation_input_tokens?: number
            cache_read_input_tokens?: number
            input_tokens?: number
            output_tokens?: number
          }
        }
        type?: string
        usage?: {
          cache_creation_input_tokens?: number
          cache_read_input_tokens?: number
          output_tokens?: number
        }
      }
      if (obj.type === 'message_start' && obj.message?.usage) {
        sawUsage = true
        usage.inputTokens = obj.message.usage.input_tokens ?? 0
        usage.outputTokens = obj.message.usage.output_tokens ?? 0
        usage.cacheCreationInputTokens = obj.message.usage.cache_creation_input_tokens ?? 0
        usage.cacheReadInputTokens = obj.message.usage.cache_read_input_tokens ?? 0
        if (obj.message.model) usage.model = obj.message.model
      } else if (obj.type === 'message_delta' && obj.usage) {
        sawUsage = true
        usage.outputTokens = Math.max(usage.outputTokens, obj.usage.output_tokens ?? usage.outputTokens)
        usage.cacheCreationInputTokens = Math.max(
          usage.cacheCreationInputTokens,
          obj.usage.cache_creation_input_tokens ?? usage.cacheCreationInputTokens
        )
        usage.cacheReadInputTokens = Math.max(
          usage.cacheReadInputTokens,
          obj.usage.cache_read_input_tokens ?? usage.cacheReadInputTokens
        )
      }
    } catch {
      /* Non-JSON SSE frame */
    }
  }
  const piped = body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      flush: async () => onUsage(usage),
      transform: (chunk, controller) => {
        buffer += decoder.decode(chunk, { stream: true })
        let idx = buffer.indexOf('\n\n')
        while (idx !== -1) {
          const frame = buffer.slice(0, idx)
          buffer = buffer.slice(idx + 2)
          parseEvent(frame)
          idx = buffer.indexOf('\n\n')
        }
        controller.enqueue(chunk)
      }
    })
  )
  return { body: piped, getUsage: () => usage, hasUsage: () => sawUsage }
}
export type { BoundedBodyOpts, ModelRates, SseTap, UsageReport }
export { boundedBody, computeActualCents, DEFAULT_RATES, MODEL_RATES, sseCostTap, withCancelHook }
