# Architecture

How an agent message flows through the stack: from a user typing in the browser, to Claude in a sandbox, to a streamed response back.

## Why this stack

Each piece earned its place by ruling out alternatives. Brief honest rationale below.

**Convex (self-hosted)** — picked over Supabase / Firebase / Postgres+own backend.

- Reactive subscriptions out of the box: client subscribes to a query, server pushes updates over the same WebSocket — no separate pubsub layer
- Scheduler (`scheduler.runAfter`) is a real durable job runner inside the DB transaction, so “schedule agent run after writing user message” is one atomic operation; no Redis/SQS to coordinate
- httpAction lets us host the Anthropic proxy in the same trust boundary as the DB; per-chat bearer auth + spend caps live next to the data they protect
- Self-hosted = our infra, our SLO; we own the deployment story

**E2B (Firecracker microVMs)** — picked over Docker / Lambda / SSH-to-VM / browser-based runtimes.

- Per-user persistent sandbox with snapshot resume: state across sessions without paying cold-start every turn
- Firecracker isolation is real (kernel-level), not just cgroups
- Resume by sandbox-id; we keep one VM per owner for 14 days, agent reconnects mid-conversation
- Their SDK handles the boring stuff (file upload, exec, stream stdout); we layer setsid + PGID-scoped cleanup on top

**Claude Agent SDK (`unstable_v2_createSession`)** — picked over raw Anthropic API loop.

- Tool loop, retries, session resume, beta header tracking baked in — official Anthropic code, kept in lockstep with API
- Drop-in support for tool definitions, MCP-style providers, system prompts
- We don’t reinvent retry/timeout/abort semantics; SDK already does them

**Next.js 16 + Turbopack + React 19** — picked over Vite / Remix / SvelteKit.

- App Router + server components + streaming SSR + middleware = chat UI patterns work without bolt-ons
- React Server Components let us keep auth/redirect logic on the server, ship less JS
- Same bundle handles auth callback, oauth proxy, static, and dynamic routes
- Mature; Turbopack dev server is fast enough that we don’t notice

**bun workspaces + lintmax** — picked over npm/pnpm/yarn.

- Single `bun install` resolves the whole monorepo; no lockfile churn (no lockfile committed at all — deps pinned to `"latest"`)
- Bun’s test runner is fast enough to run tests on every save without flinching
- lintmax bundles biome+oxlint+eslint+prettier+sort-package-json into one `bun run fix` — no per-package linter config drift

**Multi-app dispatch via `chats.app` discriminator** — picked over per-app backends or per-app schemas.

- One Convex schema serves N apps; each chat row carries the app id; routes by manifest
- Apps share auth, spend caps, sandbox pool, proxy — only their tools/prompt/UI differ
- Adding an app touches one new folder; deleting one is `rm -rf apps/<name>/` plus removing from manifest

**`packages/react/` (extracted UI)** — picked over per-app UI duplication.

- All chat plumbing (hooks, stream parsers, components, registries) lives once
- Apps consume via thin imports + a few config props (prompts, title, registries)
- Bare-bones app = ~12 files; richer apps add their own tool cards / sidebar sections / message-part renderers via registry. Peak shared, peak customizable.

## Stack at a glance

```mermaid
flowchart LR
  user(["User browser"])
  web["Next.js 16<br/>(web)"]
  convex["Convex<br/>(self-hosted)"]
  e2b["E2B<br/>(Firecracker VM)"]
  sdk["claude-agent-sdk<br/>(in sandbox)"]
  anthropic["Anthropic API"]
  user --> web
  web -->|"WebSocket / Convex client"| convex
  convex -->|"scheduler.runAfter"| e2b
  e2b -->|"setsid bun run"| sdk
  sdk -->|"events"| convex
  convex -->|"proxy"| anthropic
```

| Layer                | What                                      | Why                                                          |
| -------------------- | ----------------------------------------- | ------------------------------------------------------------ |
| Next.js 16           | Chat UI (Turbopack, React 19, App Router) | Streams messages over Convex’s reactive WebSocket            |
| Convex (self-hosted) | Auth, DB, scheduler, HTTP actions         | Realtime subscriptions out of the box; one place for state   |
| E2B                  | Ephemeral sandbox VM per user             | Firecracker isolation, persistent across turns, low overhead |
| claude-agent-sdk     | Agent loop + tool runtime in sandbox      | Official Anthropic SDK; handles streaming, sessions, tools   |
| Anthropic API        | LLM                                       | Reached via Convex proxy — sandbox never sees the real key   |

## Send → reply, end-to-end

```mermaid
sequenceDiagram
  actor User
  participant Web as Next.js
  participant Convex
  participant Agent as agent.run (action)
  participant E2B
  participant SDK as claude-agent-sdk
  participant Proxy as /api/anthropic
  participant Anthropic
  User->>Web: type message
  Web->>Convex: messages.send (mutation)
  Convex->>Convex: insert user msg, chat.streaming=true
  Convex->>Agent: scheduler.runAfter(internal.agent.run)
  Agent->>E2B: connect or create sandbox
  Agent->>E2B: write run.ts + cli.mjs, setsid bun run
  E2B->>SDK: createSession(opts)
  SDK->>Proxy: POST /v1/messages (per-chat bearer)
  Proxy->>Anthropic: forward with real key
  Anthropic-->>Proxy: SSE stream
  Proxy-->>SDK: SSE stream
  SDK-->>E2B: session.stream() events
  E2B->>Convex: POST /api/stream/event (per event)
  E2B->>Convex: POST /api/stream/complete (on result)
  Convex-->>Web: realtime push (subscription)
  Web-->>User: render
```

## Sandbox lifecycle

```mermaid
stateDiagram-v2
  [*] --> NoSandbox
  NoSandbox --> Creating: agent.run, no existing
  NoSandbox --> Resuming: agent.run, existing sandboxId
  Creating --> Running: createSandbox + write scripts + setsid
  Resuming --> Running: connectSandbox
  Resuming --> Creating: connect failed
  Running --> Streaming: SDK session.stream()
  Streaming --> Done: result event → /api/stream/complete
  Done --> Idle: chat.streaming=false
  Idle --> Resuming: next user message
  Running --> Killed: prune cron / user delete
  Killed --> [*]
```

- One user = one persistent sandbox. E2B retention 14 days; pause between messages.
- Per-chat isolation via `CLAUDE_CONFIG_DIR`/`CLAUDE_TMPDIR` namespaced by chat id.
- `setsid` wraps the agent run → kill cleans the whole process group.
- Cross-chat shared memory dir for long-term agent context.

## Anthropic proxy (per-chat bearer)

```mermaid
flowchart LR
  sandbox[sandbox/run.ts]
  proxy["/api/anthropic"]
  anthropic[api.anthropic.com]
  sandbox -->|"Bearer sk-ant-oat01-proxy_chatId_secret"| proxy
  proxy -->|"x-api-key: real key"| anthropic
  anthropic -->|"SSE"| proxy
  proxy -->|"SSE"| sandbox
```

- Sandbox env strips the real `ANTHROPIC_API_KEY` (`cleanEnv` deletes it before SDK launch).
- Bearer is shaped like an OAuth token but carries `chatId` + per-chat secret.
- Proxy parses, constant-time-compares secret against `chats.secret`, swaps for the real key.
- Limits the blast radius of a compromised sandbox to one chat’s quota.

## Streaming pipeline

```mermaid
flowchart LR
  sdk[claude-agent-sdk]
  run[sandbox/run.ts]
  http["/api/stream/event"]
  db[(streamEvents)]
  web[Web client]
  parser[parsers/stream + chunks]
  ui[UI render]
  sdk -->|JSON event| run
  run -->|POST| http
  http -->|insert| db
  db -->|realtime| web
  web --> parser
  parser --> ui
```

- Sandbox posts each SDK event as a sequenced row in `streamEvents`.
- Convex pushes new rows to subscribed clients via WebSocket.
- Client parses chunk-by-chunk; partial deltas (`text_delta`, `thinking_delta`, `input_json_delta`) accumulate until the full block lands.
- One render path unifies completed messages with live stream.

## Tool dispatch

```mermaid
flowchart LR
  agent[Agent in sandbox]
  bash[Bash tool]
  cli["CLI binary<br/>(in sandbox PATH)"]
  http["/api/cli/exec"]
  registry["generated tool registry"]
  fn["internal.tools.&lt;provider&gt;.&lt;tool&gt;"]
  agent -->|invokes| bash
  bash -->|"`provider tool --flag`"| cli
  cli -->|"HTTPS + signed auth"| http
  http -->|lookup| registry
  http -->|ctx.runAction| fn
  fn -->|JSON result| http
  http -->|JSON| cli
  cli -->|stdout| bash
  bash --> agent
```

- Tools are Convex actions/queries/mutations registered in a generated registry.
- The agent calls them via a CLI inside the sandbox (`Bash` tool → CLI → HTTPS → Convex).
- CLI auth is a signed token scoped to the chat; not transferable.

## Auth

```mermaid
sequenceDiagram
  actor User
  participant Web
  participant Convex
  participant Google
  User->>Web: click "Continue with Google"
  Web->>Google: OAuth redirect
  Google-->>Convex: /api/auth/callback/google
  Convex->>Convex: validate, set session cookie
  Convex-->>Web: redirect to allowed origin
  Web->>Convex: subsequent requests (authenticated)
```

- Google OAuth via Convex Auth + `@auth/core`.
- `SITE_URL` is a comma-list of allowed redirect origins (multiple environments share one Convex deploy).
- `ALLOWED_EMAILS` env gates who can sign in.
- `auth.getUserIdentity()` available in every Convex function.

## Trust boundaries

```mermaid
flowchart LR
  user[User browser]
  web[Web]
  convex[Convex]
  sandbox[Sandbox]
  upstream[External services]
  user -->|HTTPS| web
  web -->|Convex client| convex
  convex -->|schedules + secrets| sandbox
  sandbox -->|signed auth| convex
  convex -->|server-side HTTPS| upstream
  classDef untrusted fill:#ffe8e8,stroke:#b53636
  classDef trusted fill:#e8f7ea,stroke:#3b7a3f
  classDef external fill:#f0e8ff,stroke:#6b4fa5
  class user,sandbox untrusted
  class web,convex trusted
  class upstream external
```

- **User + sandbox** → untrusted. The agent runs with `bypassPermissions`; isolation is the VM, not the permission system inside.
- **Convex** → trusted. Holds real API keys, mediates upstream calls, signs tokens.
- **Sandbox → Convex auth** → per-chat rotating UUID secret. Constant-time-compared.

## Why this stack

- **Convex realtime is built-in.** `useQuery` is a reactive WebSocket; no Redis, no SSE plumbing for state.
- **`scheduler.runAfter` lets a mutation kick off a long-running action.** No external orchestrator.
- **`'use node'` actions run full Node.js.** E2B SDK works directly inside Convex.
- **E2B Firecracker** = ~150ms boot, persistent sessions, real Linux. Better fit than serverless containers for an interactive agent.
- **Self-hosted Convex** = own the database, own the auth, no per-row egress fees.
- **claude-agent-sdk** is the canonical agent loop; reusing it means we get session resume, partial streaming, and tool-use semantics for free.
