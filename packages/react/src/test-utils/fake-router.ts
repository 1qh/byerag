/** biome-ignore-all lint/suspicious/noExplicitAny: test fake */
/** biome-ignore-all lint/performance/useTopLevelRegex: inline regex in fake router */
/** biome-ignore-all lint/nursery/useNamedCaptureGroup: simple match */
/* eslint-disable @eslint-react/no-unnecessary-use-prefix, prefer-named-capture-group */
/* oxlint-disable eslint(prefer-named-capture-group) */
interface FakeRouterState {
  back: () => void
  pathname: string
  push: (href: string) => void
  refresh: () => void
  replace: (href: string) => void
}
let state: FakeRouterState = {
  back: () => {
    /* Empty */
  },
  pathname: '/',
  push: () => {
    /* Empty */
  },
  refresh: () => {
    /* Empty */
  },
  replace: () => {
    /* Empty */
  }
}
const resetFakeRouter = (): void => {
  state = {
    back: () => {
      /* Empty */
    },
    pathname: '/',
    push: () => {
      /* Empty */
    },
    refresh: () => {
      /* Empty */
    },
    replace: () => {
      /* Empty */
    }
  }
}
const setFakeRouter = (partial: Partial<FakeRouterState>): void => {
  state = { ...state, ...partial }
}
const useRouter = (): {
  back: () => void
  push: (href: string) => void
  refresh: () => void
  replace: (href: string) => void
} => ({
  back: state.back,
  push: state.push,
  refresh: state.refresh,
  replace: state.replace
})
const usePathname = (): string => state.pathname
const useParams = (): { id?: string } => {
  const match = /^\/chat\/([^/]+)/u.exec(state.pathname)
  return match ? { id: match[1] } : {}
}
const fakeRouter = { resetFakeRouter, setFakeRouter, useParams, usePathname, useRouter }
export default fakeRouter
export { resetFakeRouter, setFakeRouter, useParams, usePathname, useRouter }
