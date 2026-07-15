/** biome-ignore-all lint/suspicious/noUndeclaredEnvVars: debug toggle */
/* eslint-disable @eslint-react/no-unnecessary-use-prefix, @eslint-react/refs, @typescript-eslint/no-unused-vars, @typescript-eslint/require-await */
/** biome-ignore-all lint/style/noProcessEnv: debug toggle */
interface FakeChat {
  _id: string
  streaming?: boolean
  title: string
  updatedAt: number
}
interface FakePaginated {
  loadMore: () => void
  results: unknown[]
  status: string
}
interface FakeStore {
  chatList: FakeChat[]
  chatStatus: Map<string, { streaming: boolean; title?: string }>
  currentUser: FakeUser | null
  messages: Map<string, { _creationTime: number; _id: string; content: string }[]>
  streamEvents: Map<string, { _creationTime: number; _id: string; content: string; seq: number }[]>
}
interface FakeUser {
  email?: string
  image?: string
  name?: string
}
const defaultStore = (): FakeStore => ({
  chatList: [],
  chatStatus: new Map(),
  currentUser: { email: 'test@example.com', name: 'Test User' },
  messages: new Map(),
  streamEvents: new Map()
})
let store: FakeStore = defaultStore()
let sendImpl: (args: { chatId?: string; content: string }) => Promise<string> = async () => 'fake-chat-id'
const resetFakeConvex = (): void => {
  store = defaultStore()
}
const setFakeStore = (partial: Partial<FakeStore>): void => {
  Object.assign(store, partial)
}
const setFakeSend = (impl: typeof sendImpl): void => {
  sendImpl = impl
}
const FN_NAME = Symbol.for('functionName')
const apiRef = (ref: unknown): string => {
  if (typeof ref === 'string') return ref
  if (typeof ref === 'function') return ref.name
  if (ref !== null && typeof ref === 'object') {
    const obj = ref as Record<PropertyKey, unknown>
    const named = obj[FN_NAME] ?? obj._name
    if (typeof named === 'string') return named
  }
  return ''
}
const chatIdOf = (args: unknown): string => (args as null | { chatId?: string })?.chatId ?? ''
const useQuery = (fnRef: unknown, args: unknown): unknown => {
  if (args === 'skip') return
  const key = apiRef(fnRef)
  // eslint-disable-next-line no-console
  if (process.env.FAKE_CONVEX_DEBUG) console.log('useQuery key:', JSON.stringify(key))
  const has = (s: string): boolean => key.includes(s.replace('.', ':')) || key.includes(s)
  if (has('chats.status')) return store.chatStatus.get(chatIdOf(args)) ?? null
  if (has('chats.list')) return store.chatList
  if (has('messages.streamEvents')) return store.streamEvents.get(chatIdOf(args)) ?? []
  if (has('chats.currentUser')) return store.currentUser
  return null
}
const usePaginatedQuery = (_fnRef: unknown, args: unknown, _opts: unknown): FakePaginated => {
  if (args === 'skip')
    return {
      loadMore: () => {
        /* Empty */
      },
      results: [],
      status: 'Exhausted'
    }
  return {
    loadMore: () => {
      /* Empty */
    },
    results: [...(store.messages.get(chatIdOf(args)) ?? [])].toSorted((a, b) => b._creationTime - a._creationTime),
    status: 'Exhausted'
  }
}
const useMutation = (_fnRef: unknown): typeof sendImpl => sendImpl
const useAction = (fnRef: unknown): (() => Promise<unknown>) => {
  const key = apiRef(fnRef)
  const has = (s: string): boolean => key.includes(s.replace('.', ':')) || key.includes(s)
  if (has('fileActions.list')) return async () => []
  if (has('fileActions.read')) return async () => ({ binary: false, content: '' })
  return async () => undefined
}
const useConvexAuth = (): { isAuthenticated: boolean; isLoading: boolean } => ({ isAuthenticated: true, isLoading: false })
const ConvexProviderWithAuth = ({ children }: { children?: unknown }): unknown => children
const ConvexReactClient = (): Record<string, unknown> => ({})
const useConvex = (): Record<string, unknown> => ({})
const fakeConvex = {
  ConvexProviderWithAuth,
  ConvexReactClient,
  resetFakeConvex,
  setFakeSend,
  setFakeStore,
  useAction,
  useConvex,
  useConvexAuth,
  useMutation,
  usePaginatedQuery,
  useQuery
}
export default fakeConvex
export {
  ConvexProviderWithAuth,
  ConvexReactClient,
  resetFakeConvex,
  setFakeSend,
  setFakeStore,
  useAction,
  useConvex,
  useConvexAuth,
  useMutation,
  usePaginatedQuery,
  useQuery
}
export type { FakeStore }
