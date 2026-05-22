import type { ReactNode } from 'react'
import { renderHook as renderHookRaw, render as renderRaw } from '@testing-library/react'
import { AppProvider } from '../app-context'

const Wrapper = ({ children }: { children: ReactNode }) => <AppProvider appId='test'>{children}</AppProvider>
const render = (
  ui: Parameters<typeof renderRaw>[0],
  options?: Parameters<typeof renderRaw>[1]
): ReturnType<typeof renderRaw> => renderRaw(ui, { wrapper: Wrapper, ...options })
const renderHook = <Result, Props>(
  cb: (props: Props) => Result,
  options?: Parameters<typeof renderHookRaw<Result, Props>>[1]
): ReturnType<typeof renderHookRaw<Result, Props>> => renderHookRaw(cb, { wrapper: Wrapper, ...options })
export { render, renderHook }
