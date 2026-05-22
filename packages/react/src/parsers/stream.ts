import type { ContentBlock, StreamEvent } from 'backend/convex/streamProtocol'
import { rawEnvelope, sdkEnvelope, streamEvent } from 'backend/convex/streamProtocol'

const parseMessageFromObject = (json: unknown, rawFallback: string): { blocks: ContentBlock[]; type: string } => {
  const sdk = sdkEnvelope.safeParse(json)
  if (sdk.success) return { blocks: (sdk.data.message.content ?? []) as ContentBlock[], type: sdk.data.type }
  const rawMsg = rawEnvelope.safeParse(json)
  if (rawMsg.success) return { blocks: rawMsg.data.content as ContentBlock[], type: rawMsg.data.role }
  return { blocks: [{ text: rawFallback, type: 'text' }], type: 'unknown' }
}
const parseMessage = (raw: string): { blocks: ContentBlock[]; type: string } => {
  try {
    return parseMessageFromObject(JSON.parse(raw), raw)
  } catch {
    return { blocks: [{ text: raw, type: 'text' }], type: 'unknown' }
  }
}
const parseStreamEvent = (raw: string): null | StreamEvent => {
  try {
    const parsed: unknown = JSON.parse(raw)
    return streamEvent.parse(parsed)
  } catch {
    return null
  }
}
export { parseMessage, parseMessageFromObject, parseStreamEvent }
