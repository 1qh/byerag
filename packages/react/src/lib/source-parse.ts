interface SourceEntry {
  domain: string
  title: string
  url: string
}
const WWW_RE = /^www\./u
const isSafeUrl = (url: string): boolean => {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}
const extractDomain = (url: string): string => {
  try {
    return new URL(url).hostname.replace(WWW_RE, '')
  } catch {
    return url
  }
}
const toEntry = (raw: unknown): null | SourceEntry => {
  if (!raw || typeof raw !== 'object') return null
  const url = 'url' in raw && typeof raw.url === 'string' ? raw.url : ''
  if (!(url && isSafeUrl(url))) return null
  const title = 'title' in raw && typeof raw.title === 'string' ? raw.title : url
  return { domain: extractDomain(url), title, url }
}
const extractSources = (content: unknown): SourceEntry[] => {
  if (!Array.isArray(content)) return []
  const out: SourceEntry[] = []
  for (const item of content) {
    const entry = toEntry(item)
    if (entry) out.push(entry)
  }
  return out
}
export { extractSources }
export type { SourceEntry }
