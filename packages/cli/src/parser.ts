const DOUBLE_DASH_NUMBER_RE = /^--?\d/u
const parseFlags = (tokens: string[]): { args: Record<string, string>; positional: string[] } => {
  const args: Record<string, string> = {}
  const positional: string[] = []
  for (let i = 0; i < tokens.length; i += 1) {
    const tok = tokens[i]
    if (tok?.startsWith('--')) {
      const eqIdx = tok.indexOf('=')
      if (eqIdx === -1) {
        const next = tokens[i + 1]
        const isFlag = (next?.startsWith('--') ?? false) && !DOUBLE_DASH_NUMBER_RE.test(next ?? '')
        if (next === undefined || isFlag) args[tok.slice(2)] = 'true'
        else {
          args[tok.slice(2)] = next
          i += 1
        }
      } else args[tok.slice(2, eqIdx)] = tok.slice(eqIdx + 1)
    } else if (tok !== undefined) positional.push(tok)
  }
  return { args, positional }
}
const dist = (a: string, b: string): number => {
  const w = b.length + 1
  const m = new Uint16Array((a.length + 1) * w)
  const get = (idx: number): number => m[idx] ?? 0
  for (let i = 0; i <= a.length; i += 1) m[i * w] = i
  for (let j = 0; j <= b.length; j += 1) m[j] = j
  for (let i = 1; i <= a.length; i += 1)
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      m[i * w + j] = Math.min(get((i - 1) * w + j) + 1, get(i * w + (j - 1)) + 1, get((i - 1) * w + (j - 1)) + cost)
    }
  return get(a.length * w + b.length)
}
const didYouMean = (target: string, options: string[]): null | string => {
  if (options.length === 0) return null
  const sorted = options.map(o => ({ d: dist(target, o), name: o })).toSorted((a, b) => a.d - b.d)
  return sorted[0] && sorted[0].d <= 2 ? sorted[0].name : null
}
export { didYouMean, dist, parseFlags }
