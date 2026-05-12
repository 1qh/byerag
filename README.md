# byerag

Multi-app TypeScript monorepo: one self-host Convex backend + per-owner sandbox runtime + Claude Agent SDK driving a small CLI surface, serving two thin Next.js apps that share auth, chat plumbing, proxy, and sandbox lifecycle.

## Repo layout

- `apps/admin/` — Next.js admin app
- `apps/user/` — Next.js user app
- `apps/backend/` — Convex backend (`convex/`), sync script, scripts
- `packages/cli/` — CLI dispatcher framework, manifest builder, registry codegen
- `packages/react/` — shared chat hooks + components consumed by both apps
- `packages/q/` — small shared utilities
- `readonly/ui/` — synced shadcn + ai-elements components (managed by cnsync; never hand-edit)
- `scripts/` — repo-level helpers

## Local dev

`bun i` then `bun run fix` from the repo root. See `apps/<name>/README.md` for per-app commands.

Plans, decisions, requirements, and runbooks live in the sibling docs repo, not here.
