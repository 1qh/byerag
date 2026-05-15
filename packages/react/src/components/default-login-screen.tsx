/** biome-ignore-all lint/style/noProcessEnv: NEXT_PUBLIC env read at build time */
'use client'
import { DevSignInButton } from './dev-sign-in-button'
import { GoogleSignInButton } from './google-sign-in-button'
const DEV_EMAIL = process.env.NEXT_PUBLIC_DEV_SIGN_IN_EMAIL ?? ''
const DEV_ENABLED = process.env.NEXT_PUBLIC_ALLOW_DEV_TOKENS === '1' && DEV_EMAIL.length > 0
const DefaultLoginScreen = (): React.ReactElement => (
  <div className='flex flex-col items-center justify-center min-h-dvh p-6 gap-3'>
    <GoogleSignInButton />
    {DEV_ENABLED ? <DevSignInButton email={DEV_EMAIL} /> : null}
  </div>
)
export { DefaultLoginScreen }
