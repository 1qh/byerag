/* eslint-disable no-await-in-loop, @typescript-eslint/no-unsafe-assignment */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential Convex DB ops */
/** biome-ignore-all lint/nursery/noContinue: control flow shape */
/** biome-ignore-all lint/nursery/noShadow: scoped shadows ok */
/* oxlint-disable eslint(no-await-in-loop), eslint(complexity), eslint(no-shadow), eslint(no-unused-vars), eslint(no-sequences), unicorn(no-array-reduce), unicorn(prefer-ternary), eslint(max-params) */
/** biome-ignore-all lint/style/noProcessEnv: env loader site */
/** biome-ignore-all lint/nursery/noUndeclaredEnvVars: KIMI vars */
/** biome-ignore-all lint/suspicious/useAwait: fetch chain */
'use node'
import { v } from 'convex/values'
import { internal } from './_generated/api'
import { internalAction } from './_generated/server'
import { embedQuery } from './docsEmbed'
import { env } from './env'
const KIMI_TIMEOUT_MS = 60_000
const KIMI_MAX_TOKENS = 4000
const MAX_PROMPT_DOC_CHARS = 12_000
const TARGET_QUESTIONS = 10
const JSON_ARRAY_RE = /\[[\s\S]*\]/u
const TRAILING_SLASH_RE = /\/$/u
const SYSTEM_PROMPT =
  'You are an assessment-test question writer. Output JSON array only. All output must be Vietnamese except for proper nouns and technical terms which stay original.'
interface KimiResponse {
  content?: { text?: string; type?: string }[]
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
const callKimi = async (user: string): Promise<string> => {
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
  const json: KimiResponse = await res.json()
  const text = json.content?.find(c => c.type === 'text')?.text ?? ''
  if (!text) throw new Error('kimi empty response')
  return text
}
const parseQuestions = (raw: string): ParsedQuestion[] => {
  const m = JSON_ARRAY_RE.exec(raw)
  const candidate = m ? m[0] : raw.trim()
  try {
    const parsed = JSON.parse(candidate) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
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
const generate = internalAction({
  args: { docId: v.id('docs') },
  handler: async (ctx, { docId }): Promise<{ conflictsFlagged?: number; generated: number; reason?: string }> => {
    const doc = (await ctx.runQuery(internal.docs.getForConflict, { docId })) as null | {
      extractedText: string
      filename: string
    }
    if (!doc) return { generated: 0, reason: 'doc-not-found' }
    const text = doc.extractedText.slice(0, MAX_PROMPT_DOC_CHARS)
    let raw: string
    try {
      raw = await callKimi(buildUserPrompt(doc.filename, text))
    } catch (error) {
      return { generated: 0, reason: `kimi-error:${String(error).slice(0, 100)}` }
    }
    const parsed = parseQuestions(raw)
    if (parsed.length === 0) return { generated: 0, reason: 'parse-empty' }
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
