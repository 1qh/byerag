/* eslint-disable @typescript-eslint/no-shadow, no-await-in-loop */
/** biome-ignore-all lint/nursery/noShadow: scoped shadows ok */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential by design */
/** biome-ignore-all lint/style/noProcessEnv: OLLAMA_HOST env */
/** biome-ignore-all lint/nursery/noUndeclaredEnvVars: OLLAMA_HOST optional */
'use node'
import { v } from 'convex/values'
import type { Id } from './_generated/dataModel'
import { internal } from './_generated/api'
import { internalAction } from './_generated/server'

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? 'host.docker.internal'
const OLLAMA_PORT = process.env.OLLAMA_PORT ?? '11434'
const EMBED_MODEL = 'nomic-embed-text-v2-moe'
const CHUNK_SIZE = 1600
const CHUNK_OVERLAP = 200
const EMBED_DIM = 768
const EMBED_TIMEOUT_MS = 60_000
const SENTENCE_BOUNDARY_RE = /[.!?\n]/u
interface EmbedResponse {
  data?: { embedding?: number[] }[]
}
const chunkText = (text: string): { end: number; start: number; text: string }[] => {
  const chunks: { end: number; start: number; text: string }[] = []
  let pos = 0
  while (pos < text.length) {
    let end = Math.min(pos + CHUNK_SIZE, text.length)
    if (end < text.length) {
      let boundary = end
      for (let k = end; k > end - 100 && k > pos; k -= 1)
        if (SENTENCE_BOUNDARY_RE.test(text[k] ?? '')) {
          boundary = k + 1
          break
        }
      end = boundary
    }
    chunks.push({ end, start: pos, text: text.slice(pos, end) })
    if (end >= text.length) break
    pos = Math.max(pos + 1, end - CHUNK_OVERLAP)
  }
  return chunks
}
const ollamaEmbed = async (input: string, prefix: 'search_document' | 'search_query'): Promise<number[]> => {
  const res = await fetch(`http://${OLLAMA_HOST}:${OLLAMA_PORT}/v1/embeddings`, {
    body: JSON.stringify({ input: [`${prefix}: ${input}`], model: EMBED_MODEL }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
    signal: AbortSignal.timeout(EMBED_TIMEOUT_MS)
  })
  if (!res.ok) throw new Error(`ollama ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = (await res.json()) as EmbedResponse
  const vec = json.data?.[0]?.embedding
  if (vec?.length !== EMBED_DIM) throw new Error(`embed dim mismatch: got ${vec?.length ?? 'undefined'}`)
  return vec
}
const embedQuery = async (input: string): Promise<number[]> => ollamaEmbed(input, 'search_query')
const matryoshkaTruncate = (vec: number[], dim: number): number[] => {
  if (dim >= EMBED_DIM) return vec
  const out: number[] = Array.from({ length: EMBED_DIM }, () => 0)
  for (let i = 0; i < dim; i += 1) out[i] = vec[i] ?? 0
  return out
}
const centroid = (vecs: number[][]): number[] => {
  if (vecs.length === 0) return []
  const out: number[] = Array.from({ length: EMBED_DIM }, () => 0)
  for (const v of vecs) for (let i = 0; i < EMBED_DIM; i += 1) out[i] = (out[i] ?? 0) + (v[i] ?? 0)
  for (let i = 0; i < EMBED_DIM; i += 1) out[i] = (out[i] ?? 0) / vecs.length
  return out
}
const embed = internalAction({
  args: { docId: v.id('docs') },
  handler: async (ctx, { docId }): Promise<{ chunkCount?: number; embedded: boolean; reason?: string }> => {
    const target = await ctx.runQuery(internal.docs.getForEmbed, { docId })
    if (!target) return { embedded: false, reason: 'no-extracted-text' }
    if (target.policyStatus !== 'approved') return { embedded: false, reason: `policy:${target.policyStatus}` }
    let fullText = target.extractedText
    if (target.extractedTextStorageId) {
      const blob = await ctx.storage.get(target.extractedTextStorageId as Id<'_storage'>)
      if (blob) fullText = await blob.text()
    }
    const chunks = chunkText(fullText)
    if (chunks.length === 0) return { embedded: false, reason: 'no-chunks' }
    const embedded: { embedding: number[]; end: number; start: number; text: string }[] = []
    for (const ch of chunks)
      try {
        const vec = await ollamaEmbed(ch.text, 'search_document')
        embedded.push({ embedding: vec, end: ch.end, start: ch.start, text: ch.text })
      } catch (error) {
        return { embedded: false, reason: `ollama-error:${String(error).slice(0, 100)}` }
      }
    const c = centroid(embedded.map(e => e.embedding))
    await ctx.runMutation(internal.docs.persistChunks, { centroid: c, chunks: embedded, docId })
    return { chunkCount: embedded.length, embedded: true }
  }
})
export { chunkText, embed, EMBED_DIM, embedQuery, matryoshkaTruncate }
