/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* oxlint-disable react/no-unstable-nested-components */
import type { ReactNode } from 'react'
import { renderHook as renderHookRaw, render as renderRaw } from '@testing-library/react'
import { AppProvider } from '../app-context'
const Wrapper = ({ children }: { children: ReactNode }) => <AppProvider appId='test'>{children}</AppProvider>
const render: typeof renderRaw = (ui, options) => renderRaw(ui, { wrapper: Wrapper, ...options })
const renderHook: typeof renderHookRaw = (cb, options) => renderHookRaw(cb, { wrapper: Wrapper, ...options })
export { render, renderHook }
