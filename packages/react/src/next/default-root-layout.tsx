/** biome-ignore-all lint/nursery/noUndeclaredClasses: standard tailwind v4 utilities biome cannot resolve */
import type { ComponentType, ReactNode } from 'react'
import { cn } from '@a/ui'
import { mono, sans } from './fonts'

const DefaultRootLayout = ({
  Providers,
  children
}: {
  children: ReactNode
  Providers: ComponentType<{ children: ReactNode }>
}) => (
  <html className={cn('font-sans tracking-[-0.02em]', sans.variable, mono.variable)} lang='en' suppressHydrationWarning>
    <body className='h-svh min-h-screen antialiased'>
      <Providers>{children}</Providers>
    </body>
  </html>
)
export { DefaultRootLayout }
