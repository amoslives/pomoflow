# AGENTS.md

React 19 + Vite + Tailwind v4 Pomodoro timer SPA. One backend API (`/api/tasks`) for cross-device task sync; production target is Cloudflare Pages. Originated as a Google AI Studio export; the template cruft (unused deps, wrong README, unreadable `bun.lock`) has since been cleaned up.

## Commands

- Install: `npm install` (lockfile is `package-lock.json`).
- Dev: `npm run dev` — runs `tsx server.ts`, a full-stack server (Express + Vite middleware) on port 3000 (`PORT` env to override). Do not run `vite` directly.
- Typecheck / lint: `npm run lint` = `tsc --noEmit`. There is no ESLint.
- Tests: `npm test` = `node --test src/utils/*.test.ts` (node:test runner, runs `.ts` via type stripping — needs Node ≥23.6). Single file: `node --test src/utils/timer.test.ts`. Tests import only local utils, so they run without `node_modules`.
- Build: `npm run build` → `dist/` (Cloudflare Pages output dir).

**Do not use bun on the maintainer's machine.** The network hands out a broken IPv6 route; curl/Node recover via Happy Eyeballs, but bun's HTTP client does not — `bun install` hangs forever at 0% CPU with sockets stuck in `SYN_SENT`. Diagnosed 2026-10-16.

## Dual backend — keep both in sync

`/api/tasks` has two implementations that must stay behaviorally identical:

- `server.ts` — local dev (Express, persists to `.data/tasks.json`)
- `functions/api/tasks.ts` — Cloudflare Pages Function using D1 binding `TASKS_DB`; `TASKS_KV` is retained only to migrate legacy rooms on first access.

The frontend calls the relative path `/api/tasks` (`src/App.tsx`), so it works against either. When changing the API shape, update both implementations plus `src/utils/sync.ts`.

## Gotchas

- The `@` path alias maps to the **repo root**, not `src/`.
- `vite.config.ts` `DISABLE_HMR` logic is marked "Do not modify" (AI Studio agent-editing mode) — leave it as is.
- `.data/tasks.json` is runtime state written by `server.ts`; delete it to reset local sync data.
- `wrangler.toml` contains the production D1 and legacy-KV binding IDs; treat it as the Pages configuration source of truth.
- No env vars are required to run the app; `.env.example` documents the optional ones (`PORT`, `DISABLE_HMR`).
