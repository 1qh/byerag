# admin

Bare Claude Code in the web. No custom tools, no domain-specific UI. Just a chat with Claude in an E2B sandbox.

## Layout

- `src/` — Next.js 16 chat UI (Convex client)
- `server/` — system prompt + agent wiring
- `scripts/`
  - `smoke.ts` — paid e2e smoke (`bun smoke`)
  - `probe-live.ts` — free fetch probe of a deployed URL (set `PROBE_URL`)
  - `print-prompt.ts` — dump the resolved system prompt
- `tests-e2e/` — live deployed e2e tests (need `CONVEX_SELF_HOSTED_URL` + `TEST_SECRET`)

## Dev

`bun dev` from repo root → web on `localhost:3001`.
