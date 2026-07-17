/* eslint-disable no-await-in-loop */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential Convex DB ops */
'use node'
import { v } from 'convex/values'
import type { ActionCtx } from './_generated/server'
import { internal } from './_generated/api'
import { internalAction } from './_generated/server'
import { embedQuery } from './docsEmbed'
import { env } from './env'

const KIMI_TIMEOUT_MS = 60_000
const KIMI_MAX_TOKENS = 4000
const MAX_PROMPT_DOC_CHARS = 12_000
const TARGET_QUESTIONS = 10
// eslint-disable-next-line sonarjs/super-linear-regex -- single greedy quantifier bounded by trailing literal ], one backtrack scan, linear
const JSON_ARRAY_RE = /\[[\s\S]*\]/u
const TRAILING_SLASH_RE = /\/$/u
const SYSTEM_PROMPT =
  'You are an assessment-test question writer. Output JSON array only. All output must be Vietnamese except for proper nouns and technical terms which stay original.'
interface KimiResponse {
  content?: { text?: string; type?: string }[]
  usage?: KimiUsage
}
interface KimiResult {
  text: string
  usage: KimiUsage
}
interface KimiUsage {
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
  input_tokens?: number
  output_tokens?: number
}
interface ParsedQuestion {
  choices: string[]
  correctIndex: number
  prompt: string
  topicName: string
}
interface RawQuestion {
  choices?: unknown
  correctIndex?: unknown
  prompt?: unknown
  topicName?: unknown
}
const buildUserPrompt = (filename: string, text: string): string =>
  `Source document: ${filename}\n\n${text}\n\nGenerate ${TARGET_QUESTIONS} Vietnamese multiple-choice questions covering this document. Each item: {"topicName": "<short Vietnamese category>", "prompt": "<question Vietnamese>", "choices": ["A", "B", "C"], "correctIndex": 0|1|2}. Exactly 3 choices per question. Topic name is a short Vietnamese category that this question belongs to (e.g. "Bảo mật", "Triển khai", "Đánh giá rủi ro"). Output JSON array only.`
const callKimi = async (user: string): Promise<KimiResult> => {
  const res = await fetch(`${env.KIMI_BASE_URL.replace(TRAILING_SLASH_RE, '')}/v1/messages`, {
    body: JSON.stringify({
      max_tokens: KIMI_MAX_TOKENS,
      messages: [{ content: user, role: 'user' }],
      model: 'kimi-for-coding',
      system: SYSTEM_PROMPT
    }),
    headers: {
      Authorization: `Bearer ${env.KIMI_API_KEY}`,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    },
    method: 'POST',
    signal: AbortSignal.timeout(KIMI_TIMEOUT_MS)
  })
  if (!res.ok) throw new Error(`kimi ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = (await res.json()) as KimiResponse
  const text = json.content?.find(c => c.type === 'text')?.text ?? ''
  if (!text) throw new Error('kimi empty response')
  return { text, usage: json.usage ?? {} }
}
const recordKimiUsage = async (ctx: ActionCtx, u: KimiUsage): Promise<void> => {
  try {
    await ctx.runMutation(internal.costRecords.recordDirect, {
      cacheCreationInputTokens: u.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: u.cache_read_input_tokens ?? 0,
      inputTokens: u.input_tokens ?? 0,
      outputTokens: u.output_tokens ?? 0
    })
  } catch {
    /* Cost recording is best-effort — never block generation */
  }
}
const parseQuestions = (raw: string): ParsedQuestion[] => {
  const m = JSON_ARRAY_RE.exec(raw)
  const candidate = m ? m[0] : raw.trim()
  try {
    const parsed = JSON.parse(candidate) as unknown
    if (!Array.isArray(parsed)) return []
    return (parsed as unknown[])
      .filter((x): x is RawQuestion => typeof x === 'object' && x !== null)
      .map(x => {
        const choices =
          Array.isArray(x.choices) && x.choices.length === 3 && x.choices.every(c => typeof c === 'string')
            ? x.choices
            : []
        const correctIndex =
          typeof x.correctIndex === 'number' && x.correctIndex >= 0 && x.correctIndex <= 2 ? x.correctIndex : 0
        const prompt = typeof x.prompt === 'string' ? x.prompt.slice(0, 1000) : ''
        const topicName = typeof x.topicName === 'string' ? x.topicName.trim().slice(0, 80) : ''
        return { choices, correctIndex, prompt, topicName }
      })
      .filter(q => q.choices.length === 3 && q.prompt.length > 0 && q.topicName.length > 0)
  } catch {
    return []
  }
}
const MAX_RETRY = 5
const tryKimi = async (prompt: string, i: number): Promise<{ error: string; res: KimiResult | null }> => {
  try {
    const res = await callKimi(prompt)
    return { error: '', res }
  } catch (error) {
    if (i < 2)
      await new Promise<void>(resolve => {
        setTimeout(resolve, 2000 * (i + 1))
      })
    return { error: String(error).slice(0, 100), res: null }
  }
}
const generate = internalAction({
  args: { attempt: v.optional(v.number()), docId: v.id('docs') },
  // eslint-disable-next-line sonarjs/cognitive-complexity -- irreducible action handler: LLM question-generation, retry, parse, conflict-flag request wiring
  handler: async (ctx, { docId, attempt }): Promise<{ conflictsFlagged?: number; generated: number; reason?: string }> => {
    const att = attempt ?? 0
    const doc = (await ctx.runQuery(internal.docs.getForConflict, { docId })) as null | {
      extractedText: string
      filename: string
      scope: 'mine' | 'shared'
    }
    if (!doc) return { generated: 0, reason: 'doc-not-found' }
    if (doc.scope !== 'shared') return { generated: 0, reason: 'not-shared-scope' }
    const text = doc.extractedText.slice(0, MAX_PROMPT_DOC_CHARS)
    let res: KimiResult | null = null
    let lastError = ''
    for (let i = 0; i < 3; i += 1) {
      const { error, res: attempted } = await tryKimi(buildUserPrompt(doc.filename, text), i)
      if (attempted) {
        res = attempted
        break
      }
      lastError = error
    }
    if (!res) {
      if (att < MAX_RETRY)
        await ctx.scheduler.runAfter(5 * 60_000, internal.trainingGen.generate, { attempt: att + 1, docId })
      return { generated: 0, reason: `kimi-error:${lastError}${att < MAX_RETRY ? ' (rescheduled)' : ' (giving up)'}` }
    }
    await recordKimiUsage(ctx, res.usage)
    const parsed = parseQuestions(res.text)
    if (parsed.length === 0) {
      if (att < MAX_RETRY)
        await ctx.scheduler.runAfter(5 * 60_000, internal.trainingGen.generate, { attempt: att + 1, docId })
      return { generated: 0, reason: `parse-empty${att < MAX_RETRY ? ' (rescheduled)' : ' (giving up)'}` }
    }
    const embedded: {
      choices: string[]
      correctIndex: number
      prompt: string
      promptEmbedding: number[]
      topicName: string
    }[] = []
    for (const q of parsed)
      try {
        const emb = await embedQuery(q.prompt)
        embedded.push({
          choices: q.choices,
          correctIndex: q.correctIndex,
          prompt: q.prompt,
          promptEmbedding: emb,
          topicName: q.topicName
        })
      } catch {
        embedded.push({
          choices: q.choices,
          correctIndex: q.correctIndex,
          prompt: q.prompt,
          promptEmbedding: [],
          topicName: q.topicName
        })
      }
    const result = await ctx.runMutation(internal.training.persistSuggestionsWithEmbedding, {
      docId,
      questions: embedded
    })
    return { conflictsFlagged: result.conflictsFlagged, generated: parsed.length }
  }
})
export { generate }
