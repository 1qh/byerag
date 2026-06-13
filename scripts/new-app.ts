#!/usr/bin/env bun
/** biome-ignore-all lint/style/noProcessEnv: scaffold reads env */
/** biome-ignore-all lint/performance/noAwaitInLoops: small N (apps), fs IO ordered */
/* eslint-disable no-console, no-await-in-loop */
import { Vercel } from '@vercel/sdk'
import { $ } from 'bun'
import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dirname, '..')
const APPS_DIR = join(REPO_ROOT, 'apps')
const TEMPLATE = 'mini'
const PORT_MIN = 3000
const PORT_MAX = 3009
const RESERVED_BUILTINS = new Set(['backend'])
const NAME_RE = /^[a-z][a-z0-9-]*$/u
const PORT_RE = /--port (?<port>\d+)/u
const SITE_URL_RE = /^SITE_URL=(?<rest>.+)$/mu
const CONVEX_URL_RE = /^NEXT_PUBLIC_CONVEX_URL=(?<url>.+)$/mu
const die = (msg: string): never => {
  console.error(`✗ ${msg}`)
  process.exit(1)
}
const rawName = process.argv[2]
if (!rawName) {
  die('usage: bun run new-app <name>')
  throw new Error('unreachable')
}
const appName: string = rawName
if (!NAME_RE.test(appName)) die(`bad name '${appName}' — must match ${NAME_RE.source}`)
if (RESERVED_BUILTINS.has(appName)) die(`'${appName}' is reserved`)
const existingApps = new Set(
  (await readdir(APPS_DIR, { withFileTypes: true })).filter(e => e.isDirectory()).map(e => e.name)
)
if (existingApps.has(appName)) die(`apps/${appName} already exists`)
const target = join(APPS_DIR, appName)
const portsInScripts = (scripts: Record<string, string>): number[] =>
  Object.values(scripts).flatMap(cmd => {
    const found = PORT_RE.exec(cmd)?.groups?.port
    return found ? [Number(found)] : []
  })
const readAppPorts = async (name: string): Promise<number[]> => {
  try {
    const pkg = JSON.parse(await readFile(join(APPS_DIR, name, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
    }
    return portsInScripts(pkg.scripts ?? {})
  } catch {
    return []
  }
}
const usedPorts = new Set<number>()
for (const e of await readdir(APPS_DIR, { withFileTypes: true }))
  if (e.isDirectory()) for (const p of await readAppPorts(e.name)) usedPorts.add(p)
let port = -1
for (let p = PORT_MIN; p <= PORT_MAX; p += 1)
  if (!usedPorts.has(p)) {
    port = p
    break
  }
if (port === -1) die(`no free port in ${PORT_MIN}-${PORT_MAX}`)
const EXCLUDE = new Set(['.cache', '.next', '.turbo', '.vercel', 'node_modules', 'tests-e2e', 'tests-integration'])
const copyTree = async (src: string, dst: string): Promise<void> => {
  await mkdir(dst, { recursive: true })
  for (const e of await readdir(src, { withFileTypes: true }))
    if (!EXCLUDE.has(e.name)) {
      const s = join(src, e.name)
      const d = join(dst, e.name)
      await (e.isDirectory() ? copyTree(s, d) : copyFile(s, d))
    }
}
console.log(`→ scaffolding apps/${appName} on port ${port}`)
await copyTree(join(APPS_DIR, TEMPLATE), target)
const replaceInFile = async (path: string, fn: (s: string) => string): Promise<void> => {
  const text = await readFile(path, 'utf8')
  await writeFile(path, fn(text))
}
await replaceInFile(join(target, 'package.json'), s =>
  s.replaceAll('"name": "mini"', `"name": "${appName}"`).replaceAll(/--port \d+/gu, `--port ${port}`)
)
await replaceInFile(join(target, 'src', 'app.config.ts'), s => s.replaceAll("appId: 'mini'", `appId: '${appName}'`))
await replaceInFile(join(target, 'scripts', 'smoke.ts'), s => s.replaceAll("app: 'mini'", `app: '${appName}'`))
await writeFile(join(target, 'README.md'), `# ${appName}\n\nClaude Code app: ${appName}.\n`)
console.log('→ bun install')
await $`bun i`.cwd(REPO_ROOT).quiet()
const authPath = `${process.env.HOME}/Library/Application Support/com.vercel.cli/auth.json`
const auth = JSON.parse(await readFile(authPath, 'utf8')) as { token: string }
const findSourceLink = async (): Promise<{ orgId: string; projectId: string }> => {
  for (const e of await readdir(APPS_DIR, { withFileTypes: true }))
    if (e.isDirectory() && e.name !== appName)
      try {
        const text = await readFile(join(APPS_DIR, e.name, '.vercel', 'project.json'), 'utf8')
        return JSON.parse(text) as { orgId: string; projectId: string }
      } catch {
        /* No link in this app */
      }
  throw new Error('no existing app has .vercel/project.json — scaffold needs one to clone git creds from')
}
const sourceLink = await findSourceLink()
const TEAM = sourceLink.orgId
const sourcePid = sourceLink.projectId
interface VercelApi {
  projects: {
    createProject: (args: {
      requestBody: {
        framework: string
        gitRepository: { repo: string; type: string }
        name: string
        rootDirectory: string
      }
      teamId: string
    }) => Promise<{ id: string }>
    createProjectEnv: (args: {
      idOrName: string
      requestBody: { key: string; target: string[]; type: string; value: string }
      teamId: string
      upsert: string
    }) => Promise<unknown>
    getProjects: (args: { search: string; teamId: string }) => Promise<{ projects: { id: string; name: string }[] }>
  }
}
const VercelCtor = Vercel as unknown as new (opts: { bearerToken: string }) => VercelApi
const vercel = new VercelCtor({ bearerToken: auth.token })
const projectName = `byerag-${appName}`
console.log(`→ vercel: check name '${projectName}'`)
const existing = (await vercel.projects.getProjects({ search: projectName, teamId: TEAM })).projects.find(
  p => p.name === projectName
)
if (existing) die(`Vercel project '${projectName}' already exists (id=${existing.id})`)
const sourceProjectRes = await fetch(`https://api.vercel.com/v9/projects/${sourcePid}?teamId=${TEAM}`, {
  headers: { Authorization: `Bearer ${auth.token}` }
})
if (!sourceProjectRes.ok) die(`source project lookup failed: ${sourceProjectRes.status}`)
const sourceProject = (await sourceProjectRes.json()) as {
  link?: { gitCredentialId?: string; org?: string; repo?: string; repoId?: number; repoOwnerId?: number; type?: string }
}
const sourceGit = sourceProject.link
if (!(sourceGit?.repo && sourceGit.org && sourceGit.repoId)) die('source project has no git link to clone from')
const gitRepo = `${sourceGit?.org}/${sourceGit?.repo}`
console.log(`→ vercel: create project '${projectName}'`)
const created = await vercel.projects.createProject({
  requestBody: {
    framework: 'nextjs',
    gitRepository: { repo: gitRepo, type: 'github' },
    name: projectName,
    rootDirectory: `apps/${appName}`
  },
  teamId: TEAM
})
const pid = created.id
console.log(`→ vercel: link git ${gitRepo} (raw — SDK has no link op)`)
const linkRes = await fetch(`https://api.vercel.com/v9/projects/${pid}/link?teamId=${TEAM}`, {
  body: JSON.stringify({
    gitCredentialId: sourceGit?.gitCredentialId,
    org: sourceGit?.org,
    productionBranch: 'main',
    repo: sourceGit?.repo,
    repoId: sourceGit?.repoId,
    repoOwnerId: sourceGit?.repoOwnerId,
    type: 'github'
  }),
  headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
  method: 'POST'
})
if (!linkRes.ok) die(`link failed: ${linkRes.status} ${await linkRes.text()}`)
const envFile = await readFile(join(REPO_ROOT, 'apps/backend/.env'), 'utf8')
const convexUrl = CONVEX_URL_RE.exec(envFile)?.groups?.url?.trim() ?? ''
if (!convexUrl) die('NEXT_PUBLIC_CONVEX_URL missing in apps/backend/.env')
console.log('→ vercel: set NEXT_PUBLIC_CONVEX_URL env')
await vercel.projects.createProjectEnv({
  idOrName: pid,
  requestBody: {
    key: 'NEXT_PUBLIC_CONVEX_URL',
    target: ['production', 'preview', 'development'],
    type: 'plain',
    value: convexUrl
  },
  teamId: TEAM,
  upsert: 'true'
})
const newSite = `https://${projectName}.vercel.app`
if (envFile.includes(newSite)) console.log(`→ SITE_URL already includes ${newSite}`)
else {
  const newEnv = envFile.replace(SITE_URL_RE, (_, rest: string) => `SITE_URL=${newSite},${rest}`)
  await writeFile(join(REPO_ROOT, 'apps/backend/.env'), newEnv)
  console.log('→ bun sync (push SITE_URL to Convex)')
  await $`bun run sync`.cwd(join(REPO_ROOT, 'apps/backend')).quiet()
}
console.log(`
✔ apps/${appName} ready
  port:    ${port} (dev)
  vercel:  ${projectName}  →  https://${projectName}.vercel.app
  next:    git add -A && git commit -m 'feat: add app ${appName}' && git push origin main
           (vercel webhook auto-deploys all linked projects)`)
