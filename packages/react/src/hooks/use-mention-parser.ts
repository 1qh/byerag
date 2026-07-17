'use client'
const KIND_RE = /^[a-z]+$/u
const TOKEN_RE = /@(?<kind>[a-z]+)(?::(?<name>\S*))?/giu
const WS_RE = /\s/u
const SINGLETON_KINDS = new Set(['me'])
interface ActiveMention {
  end: number
  kindFragment: string
  nameFragment: null | string
  start: number
}
interface MentionToken {
  end: number
  kind: string
  name: string
  start: number
}
const parseMentions = (text: string): MentionToken[] =>
  Array.from(text.matchAll(TOKEN_RE), m => ({
    end: m.index + m[0].length,
    kind: m.groups?.kind ?? '',
    name: m.groups?.name ?? '',
    start: m.index
  })).filter(t => SINGLETON_KINDS.has(t.kind) || t.name.length > 0)
const activeMentionAt = (text: string, cursor: number): ActiveMention | null => {
  let at = -1
  for (let i = cursor - 1; i >= 0; i -= 1) {
    const ch = text.charAt(i)
    if (ch === '@') {
      at = i
      break
    }
    if (WS_RE.test(ch)) return null
  }
  if (at === -1) return null
  if (at > 0 && !WS_RE.test(text.charAt(at - 1))) return null
  const tail = text.slice(at + 1, cursor)
  const colonIdx = tail.indexOf(':')
  if (colonIdx === -1) {
    if (tail.length > 0 && !KIND_RE.test(tail)) return null
    return { end: cursor, kindFragment: tail, nameFragment: null, start: at }
  }
  const kindFragment = tail.slice(0, colonIdx)
  const nameFragment = tail.slice(colonIdx + 1)
  if (!KIND_RE.test(kindFragment)) return null
  return { end: cursor, kindFragment, nameFragment, start: at }
}
export { activeMentionAt, parseMentions, SINGLETON_KINDS }
export type { ActiveMention, MentionToken }
