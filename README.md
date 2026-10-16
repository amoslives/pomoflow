# Pomoflow

[![CI](https://github.com/amoslives/pomoflow/actions/workflows/ci.yml/badge.svg)](https://github.com/amoslives/pomoflow/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)

A one-bit Pomodoro timer. Tasks, YouTube audio, weekly focus stats, and cross-device sync by scanning a QR code. No account, no tracking.

**Try it:** [pomoflow.pages.dev](https://pomoflow.pages.dev)

![Pomoflow demo: adding tasks, running the timer, loading a YouTube track, checking stats, switching to dark mode and pairing a device by QR code](docs/demo.gif)

## What it does

- Work and break timers with a completion chime and a browser notification.
- A task list that syncs between your devices. Pair a device by scanning a QR code or opening a link. There is no sign-up.
- Any YouTube video, playlist or live stream as the soundtrack, with a queue, shuffle, repeat and seeking. Playback position survives a refresh.
- Seven-day focus stats counted from work timers that reached 00:00. Pausing or resetting does not count.
- Light, dark and system themes in a classic desktop look. Keyboard shortcuts: `Space` start or pause, `R` reset, `D` theme.

<p>
  <img src="docs/screenshot-light.png" alt="Pomoflow timer window in light mode" width="49%">
  <img src="docs/screenshot-dark.png" alt="Pomoflow timer window in dark mode" width="49%">
</p>

![Pomoflow stats window showing a seven-day bar chart](docs/screenshot-stats.png)

## How sync works

There are no user accounts. Devices that share a *sync key* share one task list.

- **Generate secure key** creates a random 128-bit key (`pf-` plus 26 base32 characters).
- Pair another device by scanning the QR code or opening the pairing link. The key travels in the URL fragment (`#sync=...`), so it never reaches a server log, and it is removed from the address bar after import.
- Tasks are stored as a revisioned document in Cloudflare D1. Local and remote lists are merged: both sides are unioned, the newer `updatedAt` wins, and a deletion wins a tie.
- **Rotate secure key** revokes the old key and moves your tasks to a new one.

The key is a capability. Anyone who has it can read and change that task list, so share pairing links only with devices you control and never paste one into an issue, screenshot or chat. Sync is optional. Without a key, tasks stay in the browser.

## Tech stack

- React 19, TypeScript, Vite and Tailwind CSS v4
- Recharts for the stats chart, loaded only when the Stats view opens
- YouTube IFrame Player API, Web Audio for the chime
- Express for local development, Cloudflare Pages Functions and D1 in production
- Node's native test runner for unit and API tests, Playwright for desktop and mobile browser tests

## Local development

Requires Node.js 24 or newer and npm.

```bash
git clone https://github.com/amoslives/pomoflow.git
cd pomoflow
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The dev server serves the app and the `/api/tasks` sync API; local sync data lives in the gitignored `.data/tasks.json`.

## Checks

```bash
npm run lint      # strict TypeScript
npm test          # unit and API contract tests
npm run test:e2e  # Playwright, desktop and mobile Chromium
npm run check     # all of the above plus a production build
```

Pull requests and pushes to `main` run the same checks in GitHub Actions. Cloudflare Pages builds a preview for every branch.

## Deployment

`wrangler.toml` is the source of truth for the Cloudflare Pages configuration.

- `TASKS_DB`: the D1 database that stores sync rooms
- `TASKS_KV`: read-only migration source for rooms created by older releases
- `migrations/`: D1 schema history

The identifiers in `wrangler.toml` are not credentials. Cloudflare API tokens and pairing links must never be committed.

## Security

Report vulnerabilities privately; see [SECURITY.md](./SECURITY.md). Do not include a pairing key or private task data in a report.

## License

[Apache License 2.0](./LICENSE)
