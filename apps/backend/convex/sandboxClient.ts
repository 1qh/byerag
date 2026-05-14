'use node'
import { Buffer } from 'node:buffer'
import { request as httpRequest } from 'node:http'
import { dirname } from 'node:path'
import { env } from './env'
const DOCKER_SOCKET = '/var/run/docker.sock'
type CommandResult = RunResult
interface ConnectOpts {
  requestTimeoutMs?: number
  timeoutMs?: number
}
interface CreateOpts {
  lifecycle?: { autoResume: boolean; onTimeout: 'kill' | 'pause' }
  timeoutMs?: number
}
interface DockerRes {
  body: Buffer
  status: number
}
interface EntryInfo {
  name: string
  path: string
  size?: number
  type: 'dir' | 'file'
}
interface ReadOpts {
  format: 'bytes' | 'text'
}
interface RunOpts {
  background?: boolean
  envs?: Record<string, string>
  timeoutMs?: number
}
interface RunResult {
  exitCode: number
  stderr: string
  stdout: string
}
interface Sandbox {
  commands: SandboxCommands
  files: SandboxFiles
  kill: () => Promise<void>
  pause: () => Promise<void>
  resume: () => Promise<void>
  sandboxId: string
}
interface SandboxCommands {
  run: (cmd: string, opts?: RunOpts) => Promise<RunResult>
}
interface SandboxFiles {
  list: (path: string) => Promise<EntryInfo[]>
  read: <F extends 'bytes' | 'text'>(path: string, opts: { format: F }) => Promise<F extends 'bytes' ? Uint8Array : string>
  write: (path: string, content: ArrayBuffer | string | Uint8Array) => Promise<void>
}
const dockerRequest = async (opts: {
  body?: Buffer | string
  contentType?: string
  method: string
  path: string
}): Promise<DockerRes> =>
  new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        headers: opts.body ? { 'Content-Type': opts.contentType ?? 'application/json' } : {},
        method: opts.method,
        path: opts.path,
        socketPath: DOCKER_SOCKET
      },
      res => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => {
          chunks.push(c)
        })
        res.on('end', () => {
          resolve({ body: Buffer.concat(chunks), status: res.statusCode ?? 0 })
        })
        res.on('error', reject)
      }
    )
    req.on('error', reject)
    if (opts.body) req.write(opts.body)
    req.end()
  })
const dockerJson = async <T>(opts: { body?: unknown; method: string; path: string }): Promise<T> => {
  const res = await dockerRequest({
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    method: opts.method,
    path: opts.path
  })
  if (res.status >= 400) throw new Error(`docker ${opts.method} ${opts.path} ${res.status}: ${res.body.toString('utf8')}`)
  if (res.body.length === 0) return {} as T
  return JSON.parse(res.body.toString('utf8')) as T
}
const withTimeout = async <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timeout after ${ms}ms`))
    }, ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
const POSIX_HEADER_SIZE = 512
const tarHeader = (name: string, size: number): Buffer => {
  const buf = Buffer.alloc(POSIX_HEADER_SIZE)
  buf.write(name.slice(0, 100), 0, 100, 'utf8')
  buf.write('0000644\0', 100, 8, 'utf8')
  buf.write('0001000\0', 108, 8, 'utf8')
  buf.write('0001000\0', 116, 8, 'utf8')
  buf.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 12, 'utf8')
  buf.write(
    `${Math.floor(Date.now() / 1000)
      .toString(8)
      .padStart(11, '0')}\0`,
    136,
    12,
    'utf8'
  )
  buf.write('        ', 148, 8, 'utf8')
  buf.write('0', 156, 1, 'utf8')
  buf.write('ustar\0', 257, 6, 'utf8')
  buf.write('00', 263, 2, 'utf8')
  let sum = 0
  for (const b of buf) sum += b
  buf.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'utf8')
  return buf
}
const tarOne = (name: string, content: Buffer | string): Buffer => {
  const payload = typeof content === 'string' ? Buffer.from(content, 'utf8') : content
  const pad = (POSIX_HEADER_SIZE - (payload.length % POSIX_HEADER_SIZE)) % POSIX_HEADER_SIZE
  return Buffer.concat([tarHeader(name, payload.length), payload, Buffer.alloc(pad), Buffer.alloc(POSIX_HEADER_SIZE * 2)])
}
const parseDockerMux = (raw: Buffer): { stderr: string; stdout: string } => {
  let stdout = ''
  let stderr = ''
  let i = 0
  while (i + 8 <= raw.length) {
    const streamType = raw[i] ?? 0
    const size = raw.readUInt32BE(i + 4)
    const start = i + 8
    const end = start + size
    if (end > raw.length) break
    const chunk = raw.subarray(start, end).toString('utf8')
    if (streamType === 1) stdout += chunk
    else if (streamType === 2) stderr += chunk
    i = end
  }
  return { stderr, stdout }
}
const execInside = async (id: string, cmd: string, opts: RunOpts): Promise<RunResult> => {
  const envs = Object.entries(opts.envs ?? {}).map(([k, v]) => `${k}=${v}`)
  const wrapped = opts.background ? `nohup ${cmd} >/dev/null 2>&1 &` : cmd
  const exec = await dockerJson<{ Id: string }>({
    body: { AttachStderr: true, AttachStdout: true, Cmd: ['sh', '-c', wrapped], Env: envs },
    method: 'POST',
    path: `/containers/${id}/exec`
  })
  const deadline = opts.timeoutMs ?? 60_000
  const started = await withTimeout(
    dockerRequest({ body: JSON.stringify({ Detach: false }), method: 'POST', path: `/exec/${exec.Id}/start` }),
    deadline,
    'exec'
  )
  const { stdout, stderr } = parseDockerMux(started.body)
  const info = await dockerJson<{ ExitCode: null | number }>({ method: 'GET', path: `/exec/${exec.Id}/json` })
  return { exitCode: info.ExitCode ?? 0, stderr, stdout }
}
const writeInside = async (id: string, path: string, content: ArrayBuffer | string | Uint8Array): Promise<void> => {
  const dir = dirname(path)
  const name = path.slice(dir.length + 1)
  const payload: Buffer | string =
    typeof content === 'string' ? content : Buffer.from(content instanceof ArrayBuffer ? new Uint8Array(content) : content)
  const archive = tarOne(name, payload)
  const res = await dockerRequest({
    body: archive,
    contentType: 'application/x-tar',
    method: 'PUT',
    path: `/containers/${id}/archive?path=${encodeURIComponent(dir)}`
  })
  if (res.status >= 400) throw new Error(`putArchive ${res.status}: ${res.body.toString('utf8')}`)
}
const killSandbox = async (sandboxId: string): Promise<void> => {
  try {
    await dockerRequest({ method: 'POST', path: `/containers/${sandboxId}/kill` })
  } catch {
    /* Already dead */
  }
  try {
    await dockerRequest({ method: 'DELETE', path: `/containers/${sandboxId}?force=true` })
  } catch {
    /* Already gone */
  }
}
const pauseContainer = async (id: string): Promise<void> => {
  try {
    await dockerRequest({ method: 'POST', path: `/containers/${id}/pause` })
  } catch {
    /* Already paused */
  }
}
const resumeContainer = async (id: string): Promise<void> => {
  try {
    await dockerRequest({ method: 'POST', path: `/containers/${id}/unpause` })
  } catch {
    /* Already running */
  }
}
const rejectNotImplemented = async (label: string): Promise<never> => {
  await Promise.resolve()
  throw new Error(`sandbox.${label} not implemented in v0`)
}
const makeSandbox = (id: string): Sandbox => ({
  commands: { run: async (cmd, opts = {}) => execInside(id, cmd, opts) },
  files: {
    list: async () => rejectNotImplemented('files.list'),
    read: async <F extends 'bytes' | 'text'>(): Promise<F extends 'bytes' ? Uint8Array : string> =>
      rejectNotImplemented('files.read'),
    write: async (path, content) => writeInside(id, path, content)
  },
  kill: async () => killSandbox(id),
  pause: async () => pauseContainer(id),
  resume: async () => resumeContainer(id),
  sandboxId: id
})
const ensureRunning = async (id: string): Promise<void> => {
  const info = await dockerJson<{ State: { Paused: boolean; Running: boolean } }>({
    method: 'GET',
    path: `/containers/${id}/json`
  })
  if (info.State.Paused) await dockerRequest({ method: 'POST', path: `/containers/${id}/unpause` })
  else if (!info.State.Running) await dockerRequest({ method: 'POST', path: `/containers/${id}/start` })
}
const createSandbox = async (templateId: string, opts: CreateOpts = {}): Promise<Sandbox> => {
  const image = templateId || env.SANDBOX_IMAGE
  const create = dockerJson<{ Id: string }>({
    body: {
      AttachStderr: false,
      AttachStdin: false,
      AttachStdout: false,
      Cmd: ['sleep', 'infinity'],
      HostConfig: {
        AutoRemove: false,
        CapDrop: ['ALL'],
        Memory: 1_073_741_824,
        NanoCpus: 2_000_000_000,
        NetworkMode: 'byerag_sandbox-egress',
        SecurityOpt: ['no-new-privileges:true']
      },
      Image: image,
      Tty: false,
      User: 'agent',
      WorkingDir: '/workspace'
    },
    method: 'POST',
    path: '/containers/create'
  })
  const created = opts.timeoutMs ? await withTimeout(create, opts.timeoutMs, 'createContainer') : await create
  await dockerRequest({ method: 'POST', path: `/containers/${created.Id}/start` })
  return makeSandbox(created.Id)
}
const connectSandbox = async (sandboxId: string, opts: ConnectOpts = {}): Promise<Sandbox> => {
  await (opts.timeoutMs
    ? withTimeout(ensureRunning(sandboxId), opts.timeoutMs, 'connectSandbox')
    : ensureRunning(sandboxId))
  return makeSandbox(sandboxId)
}
const listSandboxIds = async (): Promise<string[]> => {
  const filters = encodeURIComponent(JSON.stringify({ ancestor: [env.SANDBOX_IMAGE] }))
  const items = await dockerJson<{ Id: string }[]>({
    method: 'GET',
    path: `/containers/json?all=true&filters=${filters}`
  })
  return items.map(i => i.Id)
}
export { connectSandbox, createSandbox, killSandbox, listSandboxIds }
export type { CommandResult, EntryInfo, ReadOpts, RunOpts, RunResult, Sandbox }
