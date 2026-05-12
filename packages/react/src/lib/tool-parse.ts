const CMD_RE = /^\s*(?:bunx?\s+)?(?:x\s+)?(?<provider>[a-z][a-z0-9-]*)\s+(?<rest>.+?)\s*$/u
const TOKEN_RE = /^[a-z][a-z0-9-]*$/u
const WS_RE = /\s+/u
const BLACKLIST = new Set(['--help', '-h', 'help'])
interface TextPart {
  text: string
  type: 'text'
}
const isTextPart = (c: unknown): c is TextPart =>
  c !== null &&
  typeof c === 'object' &&
  'type' in c &&
  c.type === 'text' &&
  'text' in c &&
  typeof (c as { text: unknown }).text === 'string'
const extractText = (content: unknown): string => {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const parts: string[] = []
    for (const c of content) if (isTextPart(c)) parts.push(c.text)
    return parts.join('')
  }
  return ''
}
const parseStdout = (content: unknown): unknown => {
  const text = extractText(content)
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
const parseToolPath = (input: unknown): null | string[] => {
  const obj = input && typeof input === 'object' ? (input as Record<string, unknown>) : null
  const cmd = typeof obj?.command === 'string' ? obj.command : ''
  if (!cmd) return null
  const m = CMD_RE.exec(cmd)
  if (!m) return null
  const provider = m.groups?.provider
  const rest = (m.groups?.rest ?? '').split(WS_RE).filter(t => Boolean(t) && !t.startsWith('-'))
  if (!provider) return null
  const subs: string[] = []
  for (const t of rest) {
    if (BLACKLIST.has(t)) break
    if (!TOKEN_RE.test(t)) break
    subs.push(t)
    if (subs.length >= 3) break
  }
  return [provider, ...subs]
}
export { parseStdout, parseToolPath }
