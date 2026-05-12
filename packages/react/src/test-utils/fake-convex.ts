/* eslint-disable @typescript-eslint/no-explicit-any, @eslint-react/no-unnecessary-use-prefix, @typescript-eslint/no-unused-vars, @typescript-eslint/require-await, @typescript-eslint/prefer-nullish-coalescing */
/** biome-ignore-all lint/suspicious/noExplicitAny: test fake — mirrors convex/react surface */
/** biome-ignore-all lint/style/noProcessEnv: debug toggle */
/** biome-ignore-all lint/nursery/noUndeclaredEnvVars: debug toggle */
/** biome-ignore-all lint/suspicious/useAwait: async signature matching convex/react */
interface FakeChat {
  _id: string
  streaming?: boolean
  title: string
  updatedAt: number
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
const apiRef = (ref: any): string => {
  try {
    if (typeof ref === 'string') return ref
    if (ref?.[FN_NAME]) return String(ref[FN_NAME])
    if (ref?._name) return String(ref._name)
    if (typeof ref === 'function') return String(ref.name || '')
    return ''
  } catch {
    return ''
  }
}
const useQuery = (fnRef: any, args: any): any => {
  if (args === 'skip') return
  const key = apiRef(fnRef)
  // eslint-disable-next-line no-console
  if (process.env.FAKE_CONVEX_DEBUG) console.log('useQuery key:', JSON.stringify(key))
  const has = (s: string): boolean => key.includes(s.replace('.', ':')) || key.includes(s)
  if (has('chats.status')) return store.chatStatus.get(args?.chatId ?? '') ?? null
  if (has('chats.list')) return store.chatList
  if (has('messages.streamEvents')) return store.streamEvents.get(args?.chatId ?? '') ?? []
  if (has('chats.currentUser')) return store.currentUser
  return null
}
const usePaginatedQuery = (_fnRef: any, args: any, _opts: any): any => {
  if (args === 'skip')
    return {
      loadMore: () => {
        /* Empty */
      },
      results: [],
      status: 'Exhausted'
    }
  const chatId = args?.chatId ?? ''
  return {
    loadMore: () => {
      /* Empty */
    },
    results: store.messages.get(chatId) ?? [],
    status: 'Exhausted'
  }
}
const useMutation = (_fnRef: any): any => sendImpl
const useAction = (fnRef: any): any => {
  const key = apiRef(fnRef)
  const has = (s: string): boolean => key.includes(s.replace('.', ':')) || key.includes(s)
  if (has('fileActions.list')) return async () => []
  if (has('fileActions.read')) return async () => ({ binary: false, content: '' })
  return async () => undefined
}
const useConvexAuth = (): any => ({ isAuthenticated: true, isLoading: false })
const ConvexProviderWithAuth = ({ children }: any): any => children
const ConvexReactClient: any = (): any => ({})
const useConvex = (): any => ({})
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
