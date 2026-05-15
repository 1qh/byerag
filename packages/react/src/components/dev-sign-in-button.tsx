'use client'
import { Button } from '@a/ui/components/button'
import { useAuthActions } from '@convex-dev/auth/react'
import { useState } from 'react'
import { toast } from 'sonner'
interface DevSignInButtonProps {
  className?: string
  email: string
  label?: string
  size?: 'default' | 'lg' | 'sm'
}
const DevSignInButton = ({
  className,
  email,
  label = 'Dev sign-in',
  size = 'lg'
}: DevSignInButtonProps): React.ReactElement => {
  const { signIn } = useAuthActions()
  const [pending, setPending] = useState(false)
  const onClick = async (): Promise<void> => {
    setPending(true)
    try {
      await signIn('anonymous', { email })
    } catch (error: unknown) {
      toast.error(`Dev sign-in failed: ${String(error).slice(0, 120)}`)
      setPending(false)
    }
  }
  return (
    <Button
      className={className}
      disabled={pending}
      onClick={() => {
        // oxlint-disable-next-line promise/prefer-await-to-then, promise/prefer-await-to-callbacks -- React event handler cannot be async (no-misused-promises); .catch is the documented byerag pattern
        onClick().catch((error: unknown) => toast.error(String(error)))
      }}
      size={size}
      variant='outline'>
      {pending ? 'Signing in…' : label}
    </Button>
  )
}
export { DevSignInButton }
