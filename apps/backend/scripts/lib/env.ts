const KEY = /^[A-Za-z_]\w*$/u
const parseEnv = (text: string): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const t = line.trim()
    const eq = t.indexOf('=')
    const key = !t || t.startsWith('#') || eq <= 0 ? '' : t.slice(0, eq).trim()
    if (key && KEY.test(key))
      out[key] = t
        .slice(eq + 1)
        .trim()
        .replaceAll(/^["']|["']$/gu, '')
  }
  return out
}
export { parseEnv }
