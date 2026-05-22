'use client'
import { DevSignIn } from './dev-sign-in'
import { GoogleSignInButton } from './google-sign-in-button'

const DefaultLoginScreen = (): React.ReactElement => (
  <div className='flex min-h-dvh flex-col items-center justify-center gap-4 p-6'>
    <GoogleSignInButton />
    <DevSignIn />
  </div>
)
export { DefaultLoginScreen }
