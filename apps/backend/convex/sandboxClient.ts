'use node'
import { Sandbox } from 'e2b'
import { env } from './env'
interface ConnectOpts {
  requestTimeoutMs?: number
  timeoutMs?: number
}
interface CreateOpts {
  lifecycle?: { autoResume: boolean; onTimeout: 'kill' | 'pause' }
  timeoutMs?: number
}
const connectSandbox = async (sandboxId: string, opts: ConnectOpts = {}): Promise<Sandbox> =>
  Sandbox.connect(sandboxId, {
    apiKey: env.E2B_API_KEY,
    requestTimeoutMs: opts.requestTimeoutMs ?? 30_000,
    timeoutMs: opts.timeoutMs ?? 60_000
  })
const createSandbox = async (templateId: string, opts: CreateOpts = {}): Promise<Sandbox> =>
  Sandbox.create(templateId, {
    apiKey: env.E2B_API_KEY,
    lifecycle: opts.lifecycle ?? { autoResume: true, onTimeout: 'pause' },
    timeoutMs: opts.timeoutMs
  })
export { connectSandbox, createSandbox }
