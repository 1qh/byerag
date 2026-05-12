# Architecture

See also: [RULES](RULES.md) · [LEARNING](LEARNING.md) · [SECURITY](SECURITY.md) · [SYNC](SYNC.md).

## System

```mermaid
flowchart TB
  U([User]) -->|HTTPS| W["Next.js (apps/<app>)<br/>streaming chat UI"]
  W -->|Convex client| B["Convex backend (apps/backend)<br/>auth · DB · tool endpoints"]
  B -->|scheduler.runAfter| A["agent.ts action<br/>E2B connect/create + setsid"]
  A --> S["E2B sandbox<br/>claude-code + @a/cli"]
  S -->|bearer sk-ant-oat01-proxy_chatId_secret| P["/api/anthropic proxy<br/>attaches real key"]
  P --> AN[Anthropic API]
  S -->|x CLI| XD["/api/cli/{manifest,exec}<br/>dispatch"]
  XD --> REG["generated registry<br/>convex/tools/generated/"]
  REG --> TOOLS["tools/<provider>/<br/>defineTool(...)"]
  TOOLS -->|ctx.cached| CACHE["xToolCache<br/>24h TTL SHA-256"]
  TOOLS -->|hermeticTry or real| UP[upstream services]
  B <-->|realtime subscriptions| W
  classDef untrusted fill:#ffe8e8,stroke:#b53636,color:#111
  classDef trusted fill:#e8f0ff,stroke:#4a6fa5,color:#111
  classDef sandbox fill:#f0e8ff,stroke:#6b4fa5,color:#111
  classDef external fill:#e8f7ea,stroke:#3b7a3f,color:#111
  class U,S untrusted
  class W,B,A,P,XD,REG,TOOLS,CACHE trusted
  class AN,UP external
```

Trust boundaries: [SECURITY](SECURITY.md#architecture-overview).

## CLI tool system (3 tiers)

```mermaid
flowchart TB
  subgraph fw["Framework — packages/cli/src/ (zero project refs)"]
    builder["builder.ts<br/>createBuilder, arg.*, makeFail"]
    types["types.ts, error.ts, manifest.ts, validate.ts"]
    hermetic["hermetic.ts<br/>setHermeticAdapter"]
  end
  subgraph wiring["Wiring — tools/_app/ (project glue)"]
    auth["auth.ts<br/>AUTH_VALIDATOR"]
    cache["cache.ts<br/>xToolCache 24h TTL"]
    dispatch["dispatch.ts<br/>HTTP /api/cli/*"]
    ops["hermeticOps.ts<br/>project op catalog"]
  end
  subgraph binding["Binding — tools/_api.ts"]
    api["createBuilder(deps) once<br/>exports defineTool / defineQuery / defineMutation"]
  end
  subgraph consumer["Consumer — tools/&lt;provider&gt;/"]
    tools["tool files<br/>defineTool({ args, handler })"]
    prov["_provider.ts<br/>metadata"]
  end
  subgraph gen["tools/generated/ (codegen output)"]
    reg["registry.ts"]
    tt["toolTypes.ts"]
    tc["toolCallers.ts"]
    inv["INVENTORY.md"]
  end
  tools -->|imports from| api
  api -->|uses| builder
  api -->|uses| auth
  api -->|uses| cache
  dispatch -->|reads| reg
  builder -.->|via codegen| reg
  tools -.->|via codegen| tt
  tools -.->|via codegen| inv
  classDef framework fill:#e8f0ff,stroke:#4a6fa5,color:#111
  classDef projectwiring fill:#fff4e6,stroke:#b5731e,color:#111
  classDef bindingtier fill:#f0e8ff,stroke:#6b4fa5,color:#111
  classDef consumertier fill:#e8f7ea,stroke:#3b7a3f,color:#111
  classDef generated fill:#f5f5f5,stroke:#888,stroke-dasharray:4 2
  class builder,types,hermetic framework
  class auth,cache,dispatch,ops projectwiring
  class api bindingtier
  class tools,prov consumertier
  class reg,tt,tc,inv generated
```

Framework is fork-safe (zero project refs). Providers auto-become CLI subcommands (`<provider> <tool>`). `_`-prefixed providers are admin-tier (stripped to `admin` on the CLI). Codegen emits the registry, types, and generated `INVENTORY.md`.

## Agent / sandbox lifecycle

```mermaid
sequenceDiagram
  actor User
  participant Web as Next.js (apps/<app>)
  participant Convex as Convex (apps/backend)
  participant Agent as agent.ts action
  participant E2B as E2B Sandbox
  participant SDK as Claude Agent SDK
  participant Proxy as /api/anthropic (Convex)
  participant Anthropic
  User->>Web: send message
  Web->>Convex: messages.send (mutation)
  Convex->>Convex: insert user msg, chat.streaming=true
  Convex->>Agent: scheduler.runAfter(internal.agent.run)
  Agent->>E2B: connect(sandboxId) ? resume : create(TEMPLATE_ID)
  Agent->>E2B: prepareSandboxLayout + installAgentDeps + setsid run.ts
  E2B->>SDK: unstable_v2_createSession / resumeSession(opts)
  SDK->>Proxy: POST /v1/messages (Bearer sk-ant-oat01-proxy_chatId_noDashUuid)
  Proxy->>Proxy: parseProxyToken + constantTimeEqual vs chats.secret
  Proxy->>Anthropic: forward with real ANTHROPIC_API_KEY
  Anthropic-->>Proxy: stream (SSE)
  Proxy-->>SDK: stream
  SDK-->>E2B: session.stream() events
  E2B->>Convex: POST /api/stream/event (per event)
  E2B->>Convex: POST /api/stream/complete (on result)
  Convex->>Convex: insert assistant msg, chat.streaming=false, rotate secret
  Convex-->>Web: subscription push (messages, streamEvents)
  Web-->>User: render (streamdown + tool-cards)
```

Load-bearing constraints (not derivable from code):

- One user = one persistent E2B sandbox (pause/resume, 14-day retention).
- `setsid` wraps the agent run so PGID-scoped kills don’t touch other chats.
- `MAX_CONCURRENT_AGENTS = 3` per user (2 GB sandbox, ~470 MB/session); E2B account cap 20.
- Anthropic traffic always through the Convex proxy; `cleanEnv` strips the real key from the subprocess before SDK launch.
- First-turn system prompt uses the `<system-instructions>` wrapper pattern — see LEARNING “SDK v2 System Prompt Dead Ends” for the dead channels that forced it.

## Stream rendering

Frontend unifies completed messages + live stream events into one render pipeline:

- `parsers/stream.ts` — `parseMessage` / `parseStreamEvent`; inner content is `z.array(z.record(z.string(), z.unknown()))` — stricter schemas strip block fields mid-stream and blocks render empty.
- `parsers/chunks.ts` — `sourceToChunks(events)` → `user-text | agent | partial`. `completedBlockCountByMsg` drops partials once the full block lands.
- `parsers/partials.ts` — accumulates `text_delta`, `thinking_delta`, `input_json_delta`.
- Streamdown renders each chunk; tool-specific cards live in `apps/<app>/src/components/tool-cards/`.

## Versioning & drift

- `ToolMeta.version` threads into cache key + manifest — bump to invalidate the 24h cache.
- `ToolMeta.deprecated` adds `_deprecated` on all dispatch responses + a runtime warn.
- `tools/_app/schemaHashes.json` (generated) + `schema-drift.yml` PR workflow flag unreviewed schema changes.

## Hermetic testing

`setHermeticAdapter((op, payload) => response | undefined)` intercepts external SDK calls. All `*.integration.test.ts` run offline. Per-app op catalog lives in `apps/<app>/server/hermetic.ts`.

## Why Convex (and not others)

- Realtime push built-in; `useQuery` is reactive over WebSocket.
- `ctx.scheduler.runAfter` lets mutations schedule actions — no orchestrator process.
- `'use node'` actions run full Node.js so the E2B SDK works directly.
- Type-safe end-to-end via `_generated/api`.

Rejected during prior spikes: Supabase (realtime doesn’t pair with Edge Functions cleanly), Firebase (NoSQL + weak types), SpacetimeDB (reducers can’t make HTTP calls), custom Elysia+Postgres+Redis (too much infra to own).
