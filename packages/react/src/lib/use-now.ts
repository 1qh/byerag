import { useSyncExternalStore } from 'react'

const TICK_MS = 300_000
const subscribers = new Set<() => void>()
let timer: null | ReturnType<typeof setInterval> = null
let snapshot = Date.now()
const tick = (): void => {
  snapshot = Date.now()
  for (const s of subscribers) s()
}
const subscribe = (cb: () => void): (() => void) => {
  subscribers.add(cb)
  snapshot = Date.now()
  if (subscribers.size === 1) timer = setInterval(tick, TICK_MS)
  return () => {
    subscribers.delete(cb)
    if (subscribers.size === 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  }
}
const getSnapshot = (): number => snapshot
const getServerSnapshot = (): number => 0
const useNow = (): number => useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
export { useNow }
