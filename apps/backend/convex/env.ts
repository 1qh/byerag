/** biome-ignore-all lint/style/noProcessEnv: env loader is the single allowed site */
/** biome-ignore-all lint/nursery/noUndeclaredEnvVars: env loader reads all known vars */
/* eslint-disable @typescript-eslint/no-unnecessary-type-parameters */
import { z } from 'zod/v4'

const schema = z.object({
  CONVEX_SELF_HOSTED_URL: z.url().startsWith('http'),
  CONVEX_SITE_URL: z.url().startsWith('http'),
  KIMI_API_KEY: z.string().min(1),
  KIMI_BASE_URL: z.url().startsWith('https://'),
  SANDBOX_CONVEX_SITE_URL: z.url().startsWith('http'),
  SANDBOX_IMAGE: z.string().min(1),
  SANDBOX_RUNTIME: z.string().min(1)
})
type EnvSchema = z.infer<typeof schema>
const readRaw = (): Record<keyof EnvSchema, string | undefined> => ({
  CONVEX_SELF_HOSTED_URL: process.env.CONVEX_SELF_HOSTED_URL,
  CONVEX_SITE_URL: process.env.CONVEX_SITE_URL,
  KIMI_API_KEY: process.env.KIMI_API_KEY,
  KIMI_BASE_URL: process.env.KIMI_BASE_URL,
  SANDBOX_CONVEX_SITE_URL: process.env.SANDBOX_CONVEX_SITE_URL,
  SANDBOX_IMAGE: process.env.SANDBOX_IMAGE,
  SANDBOX_RUNTIME: process.env.SANDBOX_RUNTIME ?? 'runc'
})
const env = new Proxy({} as EnvSchema, {
  get: (_, key: string) => schema.parse(readRaw())[key as keyof EnvSchema]
})
const optEnv = new Proxy(
  {},
  {
    get: (_, key: string) => (typeof key === 'string' ? process.env[key] : undefined)
  }
)
const optionalEnv = <T extends Record<string, unknown>>(): T => optEnv as unknown as T
export { env, optionalEnv }
