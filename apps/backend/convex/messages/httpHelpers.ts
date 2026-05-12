import { z } from 'zod/v4'
const MAX_HTTP_BODY = 2_000_000
const streamEventBody = z.object({
  chatId: z.string().min(1).max(64),
  content: z.string().max(120_000),
  secret: z.string().min(1).max(128),
  seq: z.number().int().min(0).max(100_000)
})
const completeBody = z.object({
  chatId: z.string().min(1).max(64),
  secret: z.string().min(1).max(128),
  sessionId: z.string().max(64).optional()
})
const jsonErr = (error: string, status: number) => Response.json({ error }, { status })
const parseHttpBody = async (req: Request): Promise<unknown> => {
  const ct = req.headers.get('Content-Type') ?? ''
  if (!ct.includes('application/json')) return jsonErr('Content-Type must be application/json', 400)
  const cl = req.headers.get('content-length')
  if (cl && Number(cl) > MAX_HTTP_BODY) return jsonErr('body too large', 413)
  const text = await req.text()
  if (text.length > MAX_HTTP_BODY) return jsonErr('body too large', 413)
  try {
    return JSON.parse(text) as unknown
  } catch {
    return jsonErr('invalid JSON body', 400)
  }
}
export { completeBody, jsonErr, MAX_HTTP_BODY, parseHttpBody, streamEventBody }
