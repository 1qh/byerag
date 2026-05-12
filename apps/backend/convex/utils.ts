/** biome-ignore-all lint/suspicious/noBitwiseOperators: constantTimeEqual needs bitwise */
/* eslint-disable no-bitwise */
const log = (level: 'error' | 'info' | 'warn', event: string, fields: Record<string, unknown> = {}): void => {
  const line = JSON.stringify({ event, level, ts: Date.now(), ...fields })
  // eslint-disable-next-line no-console
  if (level === 'error') console.error(line)
  // eslint-disable-next-line no-console
  else console.log(line)
}
const constantTimeEqual = (a: string, b: string): boolean => {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const enc = new TextEncoder()
  const ab = enc.encode(a)
  const bb = enc.encode(b)
  const len = Math.max(ab.length, bb.length)
  let result = ab.length ^ bb.length
  for (let i = 0; i < len; i += 1) result |= (ab[i] ?? 0) ^ (bb[i] ?? 0)
  return result === 0
}
export { constantTimeEqual, log }
