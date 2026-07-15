'use client'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

const keyFor = (chatId: null | string): string => `draft-${chatId ?? 'new'}`
const QUOTA_SENTINEL = 'draft-quota-warned'
const hasWarnedQuota = (): boolean => {
  try {
    return globalThis.sessionStorage.getItem(QUOTA_SENTINEL) === '1'
  } catch {
    return false
  }
}
const markQuotaWarned = (): void => {
  try {
    globalThis.sessionStorage.setItem(QUOTA_SENTINEL, '1')
  } catch {
    /* No storage */
  }
}
const read = (chatId: null | string): string => {
  try {
    return globalThis.localStorage.getItem(keyFor(chatId)) ?? ''
  } catch {
    return ''
  }
}
const write = (chatId: null | string, value: string): void => {
  try {
    if (value) globalThis.localStorage.setItem(keyFor(chatId), value)
    else globalThis.localStorage.removeItem(keyFor(chatId))
  } catch (error: unknown) {
    if (!hasWarnedQuota()) {
      markQuotaWarned()
      const name = error instanceof Error ? error.name : 'Error'
      toast.error(`Draft not saved (${name}) — storage unavailable or full`)
    }
  }
}
const useDraft = (chatId: null | string): [string, (v: string) => void, () => void] => {
  const [value, setValue] = useState<string>(() => read(chatId))
  const latestRef = useRef(value)
  const chatIdRef = useRef(chatId)
  useEffect(() => {
    latestRef.current = value
  }, [value])
  useEffect(() => {
    if (chatIdRef.current !== chatId) {
      write(chatIdRef.current, latestRef.current)
      chatIdRef.current = chatId
      const next = read(chatId)
      latestRef.current = next
      setValue(next)
    }
  }, [chatId])
  useEffect(() => {
    const id = globalThis.setTimeout(() => write(chatId, value), 200)
    return () => {
      globalThis.clearTimeout(id)
    }
  }, [chatId, value])
  useEffect(
    () => () => {
      write(chatIdRef.current, latestRef.current)
    },
    []
  )
  const clear = (): void => {
    setValue('')
    latestRef.current = ''
    write(chatId, '')
  }
  return [value, setValue, clear]
}
export { useDraft }
