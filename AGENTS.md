# AGENTS.md

React 19 + Vite + Tailwind v4 Pomodoro timer SPA. One backend API (`/api/tasks`) for cross-device task sync; production target is Cloudflare Pages. Originated as a Google AI Studio export; the template cruft (unused deps, wrong README, unreadable `bun.lock`) has since been cleaned up.

## Commands

- Install: `npm install` (lockfile is `package-lock.json`).
- Dev: `npm run dev` — runs `tsx server.ts`, a full-stack server (Express + Vite middleware) on port 3000 (`PORT` env to override). Do not run `vite` directly.
- Typecheck / lint: `npm run lint` = `tsc --noEmit`. There is no ESLint.
- Unit/API tests: `npm test` = Node's native test runner over `src/utils/*.test.ts` and `functions/api/*.test.ts` (needs Node ≥23.6). Single file: `node --test src/utils/timer.test.ts`.
- Browser tests: `npm run test:e2e` (Playwright, desktop and mobile Chromium). Full gate: `npm run check` = strict typecheck, unit/API tests, build, then browser tests.
- Build: `npm run build` → `dist/` (Cloudflare Pages output dir).

- Use npm, not bun; `package-lock.json` is the only supported lockfile.

## Dual backend — keep both in sync

`/api/tasks` has two implementations that must stay behaviorally identical:

- `server.ts` — local dev (Express, persists to `.data/tasks.json`)
- `functions/api/tasks.ts` — Cloudflare Pages Function using D1 binding `TASKS_DB`; `TASKS_KV` is retained only to migrate legacy rooms on first access.

The frontend calls the relative path `/api/tasks` (`src/App.tsx`), so it works against either. When changing the API shape, update both implementations plus `src/utils/sync.ts`.

## UI conventions

The look is a one-bit classic desktop (menu bar, pinstriped window title bars, bevelled buttons, square checkboxes, dithered desktop). All of it comes from a small class set in `src/index.css`: `.menubar`, `.window`/`.titlebar`, `.dialog`, `.btn` (+ `-default`, `-sm`, `-lg`, `-icon`, `-ghost`), `.field`, `.checkbox`, `.groupbox`, `.list-row`, `.lcd`, `.progress`, `.slider`. Colour comes from two variables, `--ink` and `--paper`, which swap under `.dark`; do not introduce other colours. Fonts: Pixelify Sans for UI text, VT323 (`.font-data`) for digits and data; the `Pixelify Fallback` and `VT323 Fallback` faces in `src/index.css` are metric-matched local stand-ins that stop the font swap shifting the layout, so re-measure their `size-adjust` if the font stack or sizes change. The site icon (`public/icon-apple2.svg`, `public/apple-touch-icon.png`) is a 16x16 one-bit grid in the same two inks. Tailwind is used for layout only. `public/og-image.png` and `docs/*` are generated screenshots; regenerate them after visual changes.

## Gotchas

- The `@` path alias maps to the **repo root**, not `src/`.
- `vite.config.ts` `DISABLE_HMR` logic is marked "Do not modify" (AI Studio agent-editing mode) — leave it as is.
- `.data/tasks.json` is runtime state written by `server.ts`; delete it to reset local sync data.
- `wrangler.toml` contains the production D1 and legacy-KV binding IDs; treat it as the Pages configuration source of truth.
- D1 schema changes belong in numbered files under `migrations/`.
- No env vars are required to run the app; `.env.example` documents the optional ones (`PORT`, `DISABLE_HMR`).
