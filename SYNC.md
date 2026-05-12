# Credential sync

```mermaid
flowchart LR
  env_file["apps/backend/.env<br/>(source of truth)"]
  sync["scripts/sync.ts"]
  convex_env["Convex env"]
  proxy["Convex httpAction<br/>/api/anthropic"]
  sb["E2B sandbox<br/>Claude Code CLI"]
  api["Anthropic API"]
  env_file -->|read| sync
  sync -->|push all vars + ensure JWT| convex_env
  convex_env --> proxy
  sb -->|Bearer sk-ant-oat01-proxy_chatId_secret| proxy
  proxy -->|real sk-ant-api03 key| api
  classDef user fill:#e8f7ea,stroke:#3b7a3f,color:#111
  classDef script fill:#fff4e6,stroke:#b5731e,color:#111
  classDef convex fill:#e8f0ff,stroke:#4a6fa5,color:#111
  classDef sandbox fill:#f0e8ff,stroke:#6b4fa5,color:#111
  class env_file user
  class sync script
  class convex_env,proxy convex
  class sb,api sandbox
```

`apps/backend/.env` is the single source of truth. `bun sync` reads it, pushes every required var to Convex env, ensures JWT keys exist, exits. Idempotent — safe to re-run anytime.

## Run

```
bun sync
```

One-shot. Run whenever `.env` changes (key rotation, new var, etc). No daemon, no watch loop, no launchd.

`bun sync --help` for usage.

## Source of truth

`apps/backend/.env` — only file. Web reads via `bun --env-file=../backend/.env next ...` in `apps/web/package.json` scripts. Convex CLI auto-reads. CLI binary walks up to find it.

## ANTHROPIC_API_KEY

Paid Anthropic Console API key (`sk-ant-api03-...`). Static — never expires. `sync.ts` rejects anything that doesn’t start with `sk-ant-api`.

To rotate: edit `.env`, run `bun sync`.

## Troubleshooting

| Symptom                         | Fix                                                 |
| ------------------------------- | --------------------------------------------------- |
| `Not logged in · /login` (401)  | `bun sync` (key changed in `.env`?)                 |
| Rate-limited / 429              | Anthropic returns `retry-after` header inline; wait |
| `.env missing: ...`             | Add listed keys to `.env`                           |
| `ANTHROPIC_API_KEY must be ...` | Use `sk-ant-api03-*` from console.anthropic.com     |
