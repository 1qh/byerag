/** biome-ignore-all lint/style/noProcessEnv: Next.js NEXT_PUBLIC_* env read at client boundary */
/** biome-ignore-all lint/nursery/noUndeclaredEnvVars: NEXT_PUBLIC_CONVEX_URL */
'use client'
import type { ReactNode } from 'react'
import { Toaster } from '@a/ui/components/sonner'
import { TooltipProvider } from '@a/ui/components/tooltip'
import { ConvexAuthProvider } from '@convex-dev/auth/react'
import { ConvexReactClient } from 'convex/react'
import { ThemeProvider } from 'next-themes'
import type { AppCallbacks } from '../app-context'
import type { MessagePartRegistryMap, ToolCardComponent } from '../registries'
import { AppProvider } from '../app-context'
import { ChatFileUploadProvider } from '../components/chat-file-upload-provider'
import { DocSheetProvider } from '../components/doc-sheet-context'
import { PaneProvider } from '../components/pane/pane-context'
import { VerbosityProvider } from '../lib'
import { MessagePartRegistry, ToolCardProvider } from '../registries'
const envUrl = process.env.NEXT_PUBLIC_CONVEX_URL ?? ''
const convex = envUrl ? new ConvexReactClient(envUrl) : null
const ConfigError = () => (
  <div className='flex h-dvh items-center justify-center p-6 text-center'>
    <div className='max-w-md space-y-2'>
      <p className='text-lg font-medium text-destructive'>Configuration error</p>
      <p className='text-sm text-muted-foreground'>
        NEXT_PUBLIC_CONVEX_URL is not set. Configure apps/backend/.env and rebuild.
      </p>
    </div>
  </div>
)
interface DefaultProvidersProps {
  appId: string
  callbacks?: AppCallbacks
  children: ReactNode
  messagePartRegistry?: MessagePartRegistryMap
  toolCard?: ToolCardComponent
}
const DefaultProviders = ({ appId, callbacks, children, messagePartRegistry, toolCard }: DefaultProvidersProps) => {
  if (!convex) return <ConfigError />
  let inner: ReactNode = children
  if (messagePartRegistry) inner = <MessagePartRegistry value={messagePartRegistry}>{inner}</MessagePartRegistry>
  if (toolCard) inner = <ToolCardProvider value={toolCard}>{inner}</ToolCardProvider>
  return (
    <AppProvider appId={appId} callbacks={callbacks}>
      <ThemeProvider attribute='class' defaultTheme='system' disableTransitionOnChange enableSystem>
        <ConvexAuthProvider client={convex}>
          <TooltipProvider>
            <PaneProvider>
              <DocSheetProvider>
                <VerbosityProvider>
                  <ChatFileUploadProvider>{inner}</ChatFileUploadProvider>
                </VerbosityProvider>
              </DocSheetProvider>
            </PaneProvider>
            <Toaster />
          </TooltipProvider>
        </ConvexAuthProvider>
      </ThemeProvider>
    </AppProvider>
  )
}
export { DefaultProviders }
