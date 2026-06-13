/** biome-ignore-all lint/nursery/noUndeclaredClasses: standard tailwind v4 utilities biome cannot resolve */
/* eslint-disable @typescript-eslint/strict-void-return */
/** biome-ignore-all lint/style/noProcessEnv: NEXT_PUBLIC_* read at client boundary */
'use client'
import { Button } from '@a/ui/components/button'
import { Input } from '@a/ui/components/input'
import { useAuthActions } from '@convex-dev/auth/react'
import { useState } from 'react'
import { toast } from 'sonner'

const DEV_ENABLED = process.env.NEXT_PUBLIC_ALLOW_DEV_TOKENS === '1'
const DEFAULT_EMAIL = process.env.NEXT_PUBLIC_DEV_SIGN_IN_EMAIL ?? ''
const DevSignIn = (): null | React.ReactElement => {
  const { signIn } = useAuthActions()
  const [email, setEmail] = useState(DEFAULT_EMAIL)
  const [pending, setPending] = useState(false)
  if (!DEV_ENABLED) return null
  const onSignIn = async (): Promise<void> => {
    if (!email.trim()) {
      toast.error('Enter an email')
      return
    }
    setPending(true)
    try {
      await signIn('anonymous', { email: email.trim().toLowerCase() })
      globalThis.window.location.assign('/')
    } catch (error: unknown) {
      toast.error(`Dev sign-in failed: ${(error instanceof Error ? error.message : String(error)).slice(0, 120)}`)
      setPending(false)
    }
  }
  return (
    <div className='flex w-full max-w-xs flex-col gap-2 border-t pt-4'>
      <p className='text-center text-muted-foreground text-xs'>Dev sign-in (local only — no Google)</p>
      <Input
        aria-label='Dev sign-in email'
        onChange={e => setEmail(e.target.value)}
        placeholder='you@example.com'
        type='email'
        value={email}
      />
      <Button disabled={pending} onClick={onSignIn} size='sm' variant='secondary'>
        {pending ? 'Signing in…' : 'Dev sign in'}
      </Button>
    </div>
  )
}
export { DevSignIn }
