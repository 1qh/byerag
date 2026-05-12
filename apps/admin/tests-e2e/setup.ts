import { killAllSandboxes } from './helpers'
const res = await killAllSandboxes()
// eslint-disable-next-line no-console
console.log(`[e2e setup] killed ${res.killed} stale sandboxes`)
