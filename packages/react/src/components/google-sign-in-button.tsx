/** biome-ignore-all lint/nursery/noUndeclaredClasses: standard tailwind v4 utilities biome cannot resolve */
/* eslint-disable @typescript-eslint/strict-void-return */
'use client'
import { Button } from '@a/ui/components/button'
import { useAuthActions } from '@convex-dev/auth/react'
import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

const CANCEL_RE = /cancel|closed|abort|popup/iu
interface GoogleSignInButtonProps {
  className?: string
  label?: string
  pendingLabel?: string
  size?: 'default' | 'lg' | 'sm'
}
const GoogleSignInButton = ({
  className,
  label = 'Continue with Google',
  pendingLabel = 'Opening Google…',
  size = 'lg'
}: GoogleSignInButtonProps) => {
  const { signIn } = useAuthActions()
  const [pending, setPending] = useState(false)
  useEffect(() => {
    if (!pending) return
    const onFocus = (): void => setPending(false)
    globalThis.window.addEventListener('focus', onFocus)
    const timer = globalThis.setTimeout(() => setPending(false), 30_000)
    return () => {
      globalThis.window.removeEventListener('focus', onFocus)
      globalThis.clearTimeout(timer)
    }
  }, [pending])
  const onSignIn = async (): Promise<void> => {
    setPending(true)
    try {
      await signIn('google', { redirectTo: globalThis.window.location.origin })
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      const cancelled = CANCEL_RE.test(msg)
      if (!cancelled) toast.error(`Sign-in failed: ${msg.slice(0, 120)}`)
      setPending(false)
    }
  }
  return (
    <Button className={className} disabled={pending} onClick={onSignIn} size={size}>
      {pending ? <Loader2 className='mr-2 size-4 animate-spin' /> : null}
      {pending ? pendingLabel : label}
    </Button>
  )
}
export { GoogleSignInButton }
