/* eslint-disable @typescript-eslint/no-unnecessary-type-parameters */
type HermeticHandler = (op: string, payload: unknown) => unknown
let adapter: HermeticHandler | null = null
const setHermeticAdapter = (h: HermeticHandler | null): void => {
  adapter = h
}
const hermeticTry = <T = unknown>(op: string, payload: unknown): T | undefined => {
  if (!adapter) return
  const r = adapter(op, payload)
  return r === undefined ? undefined : (r as T)
}
export { hermeticTry, setHermeticAdapter }
export type { HermeticHandler }
