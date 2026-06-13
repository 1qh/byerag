/** biome-ignore-all lint/nursery/noUndeclaredClasses: standard tailwind v4 utilities biome cannot resolve */
'use client'
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@a/ui/components/ai-elements/reasoning'
import { Shimmer } from '@a/ui/components/ai-elements/shimmer'

const SENTENCE_END_RE = /[.!?] /u
const WS_RE = /\s+/gu
const LEADING_WS_RE = /^\s+/u
interface Split {
  rest: string
  summary: string
}
const splitFirstSentence = (text: string): Split => {
  if (!text.trim()) return { rest: '', summary: '' }
  const m = SENTENCE_END_RE.exec(text)
  const end = m ? m.index + 1 : text.length
  return {
    rest: text.slice(end).replace(LEADING_WS_RE, ''),
    summary: text.slice(0, end).trim().replaceAll(WS_RE, ' ')
  }
}
interface MessageReasoningProps {
  isLoading: boolean
  reasoning: string
}
const MessageReasoning = ({ isLoading, reasoning }: MessageReasoningProps) => {
  const { rest, summary } = splitFirstSentence(reasoning)
  const getThinking = (isStreaming: boolean) =>
    isStreaming ? (
      <Shimmer duration={1}>Thinking</Shimmer>
    ) : summary ? (
      <p className='text-muted-foreground text-left flex-1 min-w-0'>{summary}</p>
    ) : (
      <p>Thought for a few seconds</p>
    )
  return (
    <Reasoning className='[&_.lucide-brain]:hidden' defaultOpen={isLoading} isStreaming={isLoading}>
      <ReasoningTrigger getThinkingMessage={getThinking} />
      <ReasoningContent>{isLoading ? reasoning : rest}</ReasoningContent>
    </Reasoning>
  )
}
export { MessageReasoning }
