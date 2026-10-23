# Pomoflow

[![CI](https://github.com/amoslives/pomoflow/actions/workflows/ci.yml/badge.svg)](https://github.com/amoslives/pomoflow/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)

A one-bit Pomodoro timer. Tasks, optional YouTube playback, focus stats, and encrypted cross-device sync by scanning a QR code. No account or Pomoflow analytics.

**Try it:** [pomoflow.pages.dev](https://pomoflow.pages.dev)

![Pomoflow demo: tasks, running the timer, YouTube settings, focus stats, dark mode and encrypted pairing by QR code](docs/demo.gif)

## What it does

- Work and break timers with a completion chime and best-effort browser notifications. Countdown uses an absolute deadline and survives refresh, pause and app relaunch. Suspended browsers catch up when they resume; they cannot guarantee an alarm while suspended. Once you press Start, a line under the timer buttons says when notifications are off, blocked or unsupported, and when an alert came late because the tab wasn't running. A web page cannot see the operating system's notification settings, so check those if the app shows no warning and no notification appears. Only the session actually started earns credit. A break starts when a work session ends, and the next work session starts after the break with a notification. If you don't open the app or tap a notification for a whole work-and-break cycle, the timer pauses before the next work session, so leaving the app open adds at most one session. Every fourth work session is followed by a long break, 15 minutes by default. The tab title shows the countdown while the timer runs, and **Keep screen on while running** stops a phone or tablet from sleeping during a session, in browsers that support it.
- A task list that syncs between your devices. Pair a device by scanning a QR code or opening a link. There is no sign-up.
- YouTube videos, playlists and live streams, with a queue, shuffle, repeat and seeking. Press **Load** to add a source. The video is hidden by default so playback runs from the media bar alone; press **Video** to show the player. On the Stats view the player shrinks to a now-playing bar and keeps playing. Playback position survives a refresh, and music keeps playing when you switch to another app unless the browser or YouTube pauses it. The iOS home screen app stops music in the background; when you return, it resumes from where it stopped.
- Focus stats for the last 7 days, 30 days or 12 months, counted from work timers that reached 00:00. Pausing or resetting does not count. A daily goal, 8 timers by default, shows today's progress, and a streak counts the days in a row with at least one timer. **Export CSV** downloads every recorded day. Paired devices add up their stats.
- Light, dark and system themes in a classic desktop look. Keyboard shortcuts: `Space` start or pause, `R` reset, `D` theme.
- Installs as an app with its own window and launcher icon: **Install** in Chrome or Edge, **Add to Dock** in Safari on a Mac, **Add to Home Screen** on iPhone and Android. After the first visit the app opens offline; sync and YouTube need a connection.

<p>
  <img src="docs/screenshot-light.png" alt="Pomoflow timer window in light mode" width="49%">
  <img src="docs/screenshot-dark.png" alt="Pomoflow timer window in dark mode" width="49%">
</p>

![Pomoflow stats window showing a seven-day bar chart](docs/screenshot-stats.png)

## How sync works

There are no user accounts. Devices that share a *sync key* share one task list, their focus stats and their timer settings.

- **Generate secure key** creates a random 128-bit secret (`pf2-` plus 26 base32 characters).
- Pair another device by scanning the QR code or opening the pairing link. The secret travels in the URL fragment (`#sync=...`) and is removed from the address bar. Query-string pairing is no longer accepted. Confirm **Use room tasks only** or explicitly **Merge and share my tasks**. Opening a link alone never switches rooms or uploads tasks. A previous-list backup stays in local storage under `pomodoro_pairing_backup_<timestamp>`.
- The browser encrypts the shared document (tasks, focus stats and timer settings) using AES-GCM with a fresh 96-bit nonce for each write. Domain-separated SHA-256 derivations produce the AES key and a separate bearer credential. The server receives that credential and ciphertext, never the pairing secret or the AES key. D1 stores a hash of the bearer credential, the encrypted document and its revision.
- Each device's focus stats are filed under a random device ID that only that device writes, so stats from several devices add up without double counting. Work, break and long break lengths and the daily goal follow the most recent change on any device; a device whose settings were never changed after this feature arrived keeps its own until someone changes one. Theme and **Keep screen on while running** stay per device. Pairing shares stats and settings whichever task option you choose.
- Each device saves unacknowledged edits locally. A sync reads the latest snapshot, reapplies those edits, and writes with a revision check. Deletions leave the shared snapshot after acknowledgement; idle devices do not re-upload their old copies. Concurrent edits to the same task are resolved by the last accepted write.
- Task titles are limited to 500 characters. The encrypted document is limited to 1.8 MB; the old 500-lifetime-task limit is gone. Oversized existing data stays local with an actionable error until edited or deleted. Records are never silently dropped to fit.
- **Rotate secure key** copies your tasks, stats and settings to a new encrypted room and permanently revokes the old credential. Other devices show a revoked-key error and must pair with the new link. Rotation checks the old revision to avoid losing simultaneous edits. It cannot erase copies somebody already downloaded.
- Legacy keys are read-only recovery sources. Weak keys cannot read rooms; rotate using the tasks already saved on your device. For old random `pf-` keys, rotation first retrieves the legacy room, encrypts it with a new secret, then revokes and clears the old room. Migration removes the KV copy after D1 has stored it. Unmigrated legacy rooms remain plaintext until rotated or deleted.
- On iPhone and iPad, an app added to the Home Screen keeps its own storage, separate from Safari, and pairing links open in Safari. Pair it by pasting the pairing link into **Sync key**.

The key is a capability. Anyone who has it can read and change those tasks, stats and settings, so share pairing links only with devices you control and never paste one into an issue, screenshot or chat. Sync is optional. Without a key, all of them stay in the browser.

Encryption protects each new snapshot of the shared document in transit through the API and at rest in D1. Devices keep local tasks, stats, settings and pairing secrets in browser storage. You still trust the deployed JavaScript and the devices you pair; a compromised deployment could change that JavaScript. The server sees request timing, IP addresses and document sizes. A D1-backed limit permits 120 requests per IP per minute across isolates.

## Third-party connections

YouTube is loaded only when you play or load a source. Its privacy-enhanced embed may still collect playback data and use cookies. Google Fonts loads the UI fonts. These services receive network information such as your IP address. Pomoflow itself adds no analytics scripts. See [Google's privacy policy](https://policies.google.com/privacy) and [YouTube's terms](https://www.youtube.com/t/terms).

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

Open [http://localhost:3000](http://localhost:3000). The dev server serves the app and the `/api/tasks` sync API; local sync data lives in the gitignored `.data/tasks.sqlite`. The server imports the old `.data/tasks.json` once and keeps it as a local backup. Both environments execute the same API handler and SQL migrations.

## Checks

```bash
npm run lint      # strict TypeScript
npm test          # unit and API contract tests
npm run test:e2e  # Playwright, desktop and mobile Chromium; also builds and serves the app on port 3100 for the offline tests
npm run check     # all of the above plus a production build
```

Pull requests and pushes to `main` run the same checks in GitHub Actions. Cloudflare Pages builds a preview for every branch.

## Deployment

`wrangler.toml` is the source of truth for the Cloudflare Pages configuration.

- `TASKS_DB`: the D1 database that stores sync rooms
- `TASKS_KV`: migration source for legacy rooms; migrated entries are deleted
- `migrations/`: D1 schema history

The identifiers in `wrangler.toml` are not credentials. Cloudflare API tokens and pairing links must never be committed.

Apply migrations to the production D1 database **before deploying this release**:

```bash
npx wrangler d1 migrations apply pomoflow-sync --remote
```

Migration `0002_revocation_and_rate_limits.sql` adds persistent revocations and shared rate-limit counters. Existing clients must reload, rotate legacy keys, and re-pair their other devices. Deployments using separate preview D1 databases need the same migrations applied there.

## Security

Report vulnerabilities privately; see [SECURITY.md](./SECURITY.md). Do not include a pairing key, private tasks or stats in a report.

## License

[Apache License 2.0](./LICENSE)
