/** biome-ignore-all lint/suspicious/noExplicitAny: happy-dom globals wiring */
/** biome-ignore-all lint/nursery/noComponentHookFactories: test mock factories */
/* eslint-disable @eslint-react/no-unnecessary-use-prefix */
import fakeConvex from '@a/react/test-utils/fake-convex'
import fakeRouter from '@a/react/test-utils/fake-router'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { mock } from 'bun:test'
GlobalRegistrator.register()
mock.module('convex/react', () => fakeConvex)
mock.module('next/navigation', () => fakeRouter)
mock.module('next-themes', () => ({
  ThemeProvider: ({ children }: { children: unknown }) => children,
  useTheme: () => ({
    resolvedTheme: 'light',
    setTheme: () => {
      /* Empty */
    },
    theme: 'light'
  })
}))
mock.module('@convex-dev/auth/react', () => ({
  useAuthActions: () => ({
    signIn: async () => {
      /* Empty */
    },
    signOut: async () => {
      /* Empty */
    }
  })
}))
mock.module('sonner', () => ({
  Toaster: () => null,
  toast: Object.assign(
    () => {
      /* Empty */
    },
    {
      error: () => {
        /* Empty */
      },
      success: () => {
        /* Empty */
      }
    }
  )
}))
mock.module('idecn', () => ({
  Workspace: () => null
}))
const fontStub = (): { className: string } => ({ className: 'font-stub' })
mock.module('next/font/google', () => ({
  Inter: fontStub,
  Roboto_Serif: fontStub,
  Source_Serif_4: fontStub
}))
