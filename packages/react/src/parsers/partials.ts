import type { StreamEvent } from 'backend/convex/streamProtocol'

interface LiveBucket extends StreamDeltaBucket {
  msgId: null | string
}
interface PartialBlock {
  acc: string
  blockIndex: number
  kind: string
}
interface StreamDeltaBucket {
  blocks: PartialBlock[]
  id: string
}
const startBlock = (event: Record<string, unknown>): null | PartialBlock => {
  const { content_block: cb, index } = event as { content_block?: unknown; index?: unknown }
  if (!cb || typeof cb !== 'object') return null
  const c = cb as Record<string, unknown>
  return {
    acc: '',
    blockIndex: typeof index === 'number' ? index : 0,
    kind: typeof c.type === 'string' ? c.type : 'unknown'
  }
}
const applyDelta = (block: PartialBlock, event: Record<string, unknown>): void => {
  const { delta } = event as { delta?: unknown }
  if (!delta || typeof delta !== 'object') return
  const d = delta as { partial_json?: unknown; text?: unknown; thinking?: unknown }
  if (typeof d.text === 'string') block.acc += d.text
  else if (typeof d.thinking === 'string') block.acc += d.thinking
  else if (typeof d.partial_json === 'string') block.acc += d.partial_json
}
const messageIdFromStart = (event: Record<string, unknown>): null | string => {
  const { message } = event as { message?: unknown }
  if (!message || typeof message !== 'object') return null
  const { id } = message as { id?: unknown }
  return typeof id === 'string' ? id : null
}
const assemblePartials = (
  parsed: { _id: string; e: StreamEvent }[],
  completedBlockCountByMsg: Map<string, number>
): StreamDeltaBucket[] => {
  const buckets: LiveBucket[] = []
  let cur: LiveBucket | null = null
  for (const item of parsed) {
    const { e } = item
    if (e.type === 'stream_event' && e.event) {
      const et = e.event.type
      if (et === 'message_start') {
        cur = { blocks: [], id: item._id, msgId: messageIdFromStart(e.event) }
        buckets.push(cur)
      } else if (et === 'content_block_start' && cur) {
        const b = startBlock(e.event)
        if (b) cur.blocks.push(b)
      } else if (et === 'content_block_delta' && cur) {
        const last = cur.blocks.at(-1)
        if (last) applyDelta(last, e.event)
      }
    }
  }
  const out: StreamDeltaBucket[] = []
  for (const b of buckets) {
    const done = b.msgId ? (completedBlockCountByMsg.get(b.msgId) ?? 0) : 0
    const filtered = b.blocks.filter(bl => bl.blockIndex >= done)
    if (filtered.length > 0) out.push(Object.assign(b, { blocks: filtered }))
  }
  return out
}
export { applyDelta, assemblePartials, messageIdFromStart, startBlock }
export type { PartialBlock, StreamDeltaBucket }
