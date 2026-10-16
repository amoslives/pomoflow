# Pomoflow

[![CI](https://github.com/amoslives/pomoflow/actions/workflows/ci.yml/badge.svg)](https://github.com/amoslives/pomoflow/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)

A retro pixel-style Pomodoro timer with tasks, YouTube audio, cross-device sync, and focus statistics.

**Live app:** [pomoflow.pages.dev](https://pomoflow.pages.dev)

## Features

- Configurable work and break timers with completion chimes and browser notifications
- Task creation, editing, completion, deletion, and revision-safe cross-device sync
- Secure QR/share-link device pairing backed by Cloudflare Pages Functions and D1
- YouTube videos and playlists with queue management, shuffle, repeat, live-stream handling, and seeking
- Seven-day focus statistics based on the actual duration of completed work timers
- Responsive light and dark pixel UI

## Pairing security

Cross-device sync uses a randomly generated 128-bit capability credential. Anyone who has a pairing link can access that sync room.

- Share pairing links only with devices you control.
- Never post a pairing link in an issue, screenshot, chat, or log.
- Use **Rotate Secure Key** to revoke the old room credential and generate a replacement.
- Pairing credentials travel in the URL fragment (`#sync=...`) and are removed from the address bar after import.

Pomoflow can also be used locally without enabling sync.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Space` | Start or pause the timer |
| `R` | Reset the current interval |
| `D` | Toggle light or dark mode |

Shortcuts are disabled while focus is inside an input field.

## Tech stack

- React 19, TypeScript, Vite, and Tailwind CSS v4
- Recharts, loaded only when the Stats view is opened
- YouTube IFrame Player API and Web Audio timer alerts
- Express for local development
- Cloudflare Pages Functions with revisioned D1 task storage
- Node native tests and Playwright desktop/mobile browser tests

## Local development

### Requirements

- Node.js 24+
- npm

```bash
git clone https://github.com/amoslives/pomoflow.git
cd pomoflow
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Local cross-device task data is stored in the gitignored `.data/tasks.json` file.

## Verification

```bash
# Strict TypeScript
npm run lint

# Unit and API contract tests
npm test

# Desktop and mobile Chromium tests
npm run test:e2e

# Typecheck, tests, production build, and browser tests
npm run check
```

Pull requests and pushes to `main` run the same checks in GitHub Actions. Cloudflare Pages also creates a preview deployment for each branch.

## Cloudflare resources

`wrangler.toml` is the deployment configuration source of truth.

- `TASKS_DB`: primary D1 sync database
- `TASKS_KV`: temporary read-only migration source for rooms created by older releases
- `migrations/`: D1 schema history

Cloudflare resource identifiers in `wrangler.toml` are identifiers, not credentials. Cloudflare API credentials and pairing links must never be committed.

## Security

Please report vulnerabilities privately. See [SECURITY.md](./SECURITY.md). Do not include a pairing credential or private task data in a report.

## License

Licensed under the [Apache License 2.0](./LICENSE).
