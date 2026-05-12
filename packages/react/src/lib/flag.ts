const CODEPOINT_A = 127_462
const CODEPOINT_UPPER_A = 65
const flagEmoji = (iso2: string | undefined): string => {
  if (iso2?.length !== 2) return ''
  const code = iso2.toUpperCase()
  const a = code.codePointAt(0) ?? 0
  const b = code.codePointAt(1) ?? 0
  if (a < CODEPOINT_UPPER_A || a > CODEPOINT_UPPER_A + 25 || b < CODEPOINT_UPPER_A || b > CODEPOINT_UPPER_A + 25) return ''
  return (
    String.fromCodePoint(CODEPOINT_A + a - CODEPOINT_UPPER_A) + String.fromCodePoint(CODEPOINT_A + b - CODEPOINT_UPPER_A)
  )
}
export { flagEmoji }
