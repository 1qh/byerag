/** biome-ignore-all lint/style/noProcessEnv: env loader is the single allowed site */
/** biome-ignore-all lint/nursery/noUndeclaredEnvVars: env loader reads all known vars */
/* eslint-disable @typescript-eslint/no-unnecessary-type-parameters */
import { z } from 'zod/v4'
const schema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  CONVEX_SELF_HOSTED_URL: z.url().startsWith('https://'),
  CONVEX_SITE_URL: z.url().startsWith('https://'),
  E2B_API_KEY: z.string().min(1),
  TEMPLATE_ID: z.string().min(1)
})
type EnvSchema = z.infer<typeof schema>
const readRaw = (): Record<keyof EnvSchema, string | undefined> => ({
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  CONVEX_SELF_HOSTED_URL: process.env.CONVEX_SELF_HOSTED_URL,
  CONVEX_SITE_URL: process.env.CONVEX_SITE_URL,
  E2B_API_KEY: process.env.E2B_API_KEY,
  TEMPLATE_ID: process.env.TEMPLATE_ID
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
