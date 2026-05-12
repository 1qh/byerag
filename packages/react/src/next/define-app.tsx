/** biome-ignore-all lint/nursery/noComponentHookFactories: defineApp's whole purpose is producing components from a config */
import type { Metadata } from 'next'
import type { ComponentType, ReactNode } from 'react'
import type { AppCallbacks } from '../app-context'
import type { MessagePartRegistryMap, ToolCardComponent } from '../registries'
import { DefaultLoginScreen } from '../components/default-login-screen'
import { DefaultMainLayout } from './default-main-layout'
import { DefaultProviders } from './default-providers'
import { DefaultRootLayout } from './default-root-layout'
interface DefineAppConfig {
  appId: string
  callbacks?: AppCallbacks
  inputPlaceholder?: string
  LoginScreen?: ComponentType
  messagePartRegistry?: MessagePartRegistryMap
  metadata?: Metadata
  paneSlot?: ReactNode
  prompts?: readonly string[]
  sidebarSlotAboveHistory?: ReactNode
  sidebarSlotBelowHistory?: ReactNode
  title?: string
  toolCard?: ToolCardComponent
}
interface DefinedApp {
  MainLayout: ComponentType<{ children: ReactNode }>
  metadata: Metadata
  Providers: ComponentType<{ children: ReactNode }>
  RootLayout: ComponentType<{ children: ReactNode }>
}
const defineApp = (config: DefineAppConfig): DefinedApp => {
  const Providers = ({ children }: { children: ReactNode }) => (
    <DefaultProviders
      appId={config.appId}
      callbacks={config.callbacks}
      messagePartRegistry={config.messagePartRegistry}
      toolCard={config.toolCard}>
      {children}
    </DefaultProviders>
  )
  const MainLayout = ({ children }: { children: ReactNode }) => (
    <DefaultMainLayout
      inputPlaceholder={config.inputPlaceholder}
      LoginScreen={config.LoginScreen ?? DefaultLoginScreen}
      paneSlot={config.paneSlot}
      prompts={config.prompts}
      sidebarSlotAboveHistory={config.sidebarSlotAboveHistory}
      sidebarSlotBelowHistory={config.sidebarSlotBelowHistory}
      title={config.title}>
      {children}
    </DefaultMainLayout>
  )
  const RootLayout = ({ children }: { children: ReactNode }) => (
    <DefaultRootLayout Providers={Providers}>{children}</DefaultRootLayout>
  )
  return { MainLayout, Providers, RootLayout, metadata: { title: config.appId, ...config.metadata } }
}
export { defineApp }
export type { DefineAppConfig, DefinedApp }
