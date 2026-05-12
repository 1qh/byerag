'use client'
import { useEffect, useState } from 'react'
const useCountdown = (seconds: number, onExpire: () => void): { cancel: () => void; remaining: number } => {
  const [remaining, setRemaining] = useState(seconds)
  const [cancelled, setCancelled] = useState(false)
  useEffect(() => {
    if (cancelled || remaining <= 0) return
    const t = setTimeout(() => {
      setRemaining(r => r - 1)
      if (remaining === 1) onExpire()
    }, 1000)
    return () => {
      clearTimeout(t)
    }
  }, [cancelled, remaining, onExpire])
  return { cancel: () => setCancelled(true), remaining: cancelled ? -1 : remaining }
}
export { useCountdown }
