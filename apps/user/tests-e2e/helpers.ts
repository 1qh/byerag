/** biome-ignore-all lint/performance/noAwaitInLoops: sequential test ops */
/** biome-ignore-all lint/style/noProcessEnv: test env access */
/* eslint-disable no-await-in-loop, no-console, @typescript-eslint/max-params, @typescript-eslint/prefer-destructuring, @typescript-eslint/prefer-nullish-coalescing */
/* oxlint-disable unicorn/no-process-exit */
import { api } from 'backend/convex/_generated/api'
import { ConvexHttpClient } from 'convex/browser'

const ENV = process.env as { CONVEX_SELF_HOSTED_URL?: string; TEST_SECRET?: string }
const URL = ENV.CONVEX_SELF_HOSTED_URL
if (!URL) {
  console.error('CONVEX_SELF_HOSTED_URL not set')
  process.exit(1)
}
const TEST_SECRET = ENV.TEST_SECRET
if (!TEST_SECRET) {
  console.error('TEST_SECRET not set')
  process.exit(1)
}
const TS = Date.now()
let counter = 0
const client = new ConvexHttpClient(URL)
const testSecret = TEST_SECRET
interface Test {
  fn: (ctx: { email: string; fresh: typeof fresh; test: (name: string, ok: boolean) => void }) => Promise<void>
  name: string
}
const fresh = (prefix = 'e2e') => {
  counter += 1
  return `${prefix}-${TS}-${counter}@test.com`
}
const blocks = (m: { content: string }): { [k: string]: unknown; text?: string; type: string }[] => {
  try {
    const p = JSON.parse(m.content) as {
      content?: { text?: string; type: string }[]
      message?: { content?: { text?: string; type: string }[] }
    }
    return p.message?.content || p.content || []
  } catch {
    return []
  }
}
const killAllSandboxes = async (): Promise<{ killed: number }> =>
  client.action(api.testingNode.killAllSandboxes, { testSecret })
const downloadZip = async (email: string, path: string) =>
  client.action(api.testing.downloadZip, { email, path, testSecret })
const listChats = async (email: string) => client.query(api.testing.listChats, { email, testSecret })
const listFiles = async (email: string, path: string) => client.action(api.testing.listFiles, { email, path, testSecret })
const listMessages = async (chatId: string) => {
  const result = await client.query(api.testing.listMessages, {
    chatId: chatId as never,
    paginationOpts: { cursor: null, numItems: 1000 },
    testSecret
  })
  return result.page
}
const listStreamEvents = async (chatId: string) =>
  client.query(api.testing.listStreamEvents, { chatId: chatId as never, testSecret })
const readFile = async (email: string, path: string) => client.action(api.testing.readFile, { email, path, testSecret })
const removeChat = async (email: string, chatId: string) =>
  client.mutation(api.testing.removeChat, { chatId: chatId as never, email, testSecret })
const sendMessage = async (args: { chatId?: string; content: string; email: string }) =>
  client.mutation(api.testing.send, {
    app: 'user',
    chatId: args.chatId as never,
    content: args.content,
    email: args.email,
    testSecret
  })
const uploadFile = async (email: string, path: string, content: string, binary?: boolean) =>
  client.action(api.testing.uploadFile, { binary, content, email, path, testSecret })
const countCompletedTurns = (msgs: { type: string }[]): number => {
  let completed = 0
  for (let j = 0; j < msgs.length; j += 1)
    if (msgs[j]?.type === 'user' && msgs.slice(j + 1).some((m: { type: string }) => m.type === 'assistant')) completed += 1
  return completed
}
const isErrorEvent = (e: { content: string }): boolean => {
  try {
    return (JSON.parse(e.content) as { type: string }).type === 'error'
  } catch {
    return false
  }
}
const waitFor = async (chatId: string, minTurns = 1, timeoutS = 300) => {
  for (let i = 0; i < timeoutS; i += 1) {
    await new Promise<void>(resolve => {
      setTimeout(resolve, 1000)
    })
    const result = await client.query(api.testing.listMessages, {
      chatId: chatId as never,
      paginationOpts: { cursor: null, numItems: 500 },
      testSecret
    })
    const msgs: { type: string }[] = result.page
    if (countCompletedTurns(msgs) >= minTurns) {
      const streaming = await client.query(api.testing.getChatStreaming, {
        chatId: chatId as never,
        testSecret
      })
      if (!streaming) return true
    } else {
      const events: { content: string }[] = await client.query(api.testing.listStreamEvents, {
        chatId: chatId as never,
        testSecret
      })
      if (events.some(isErrorEvent)) return false
    }
  }
  return false
}
export {
  api,
  blocks,
  client,
  downloadZip,
  fresh,
  killAllSandboxes,
  listChats,
  listFiles,
  listMessages,
  listStreamEvents,
  readFile,
  removeChat,
  sendMessage,
  testSecret,
  uploadFile,
  waitFor
}
export type { Test }
