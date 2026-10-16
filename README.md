# Pomodoro Focus ⏱️

A retro pixel-style Pomodoro productivity timer with customizable intervals, task management, ambient background audio / YouTube player, cross-device task sync with Cloudflare, and weekly productivity data visualization.

**Live app:** [pomoflow.pages.dev](https://pomoflow.pages.dev)

---

## ✨ Features

- **Retro Pixel & Monochrome Aesthetic**:
  - Pixel typography using Google Fonts `VT323` and `Share Tech Mono`.
  - Classic retro card container with square borders, drop shadows, and clean retro range sliders.
  - Seamless Dark and Light mode themes with instant toggle and local storage persistence.
- **Pomodoro Timer**:
  - Circular SVG progress ring with large digital countdown (`25:00`).
  - Active session indicator badge (`Work` vs `Break`).
  - Retro sliders for Work duration (1–90 min) and Break duration (1–45 min), locked during active countdowns with `(pause to change)` hints.
  - Web Audio 8-bit chimes for session completion and optional browser notifications.
- **Task Management**:
  - Inline task input with retro `+` button and `Enter` key creation.
  - Custom retro checkboxes separating pending and completed tasks.
  - Inline title editing and deletion with hover/tap actions.
  - Cross-device sync supported via Cloudflare Pages & KV.
- **Docked Audio Player**:
  - **YouTube API Integration**: Load and play any individual YouTube song/video or playlist URL/ID.
  - **Shuffle & Repeat Modes**: Randomize playlist playback using Fisher-Yates and toggle Repeat One, Repeat All, or Repeat Off.
  - **Queue / Playlist Manager**: Expand the drawer to inspect loaded tracks, see active track indicator (`▶`), jump directly to tracks, or remove items.
- **Weekly Focus Analytics**:
  - Separate **[Stats]** tab powered by **Recharts**.
  - Bar chart showing daily completed Pomodoros across the past 7 days.
  - Metric summary cards: Total Completed Sessions, Focus Time in Hours, Daily Average, and Peak Day.
  - Automatic session logging upon Pomodoro work completion.
- **Cloudflare Cross-Device Sync**:
  - Generate or enter a personal sync passphrase (e.g. `focus-2026`).
  - Shareable pairing link (`https://yourdomain.com/?sync=YOUR_KEY`) to instantly pair phones, laptops, and workstations.
  - Fully compatible with Cloudflare Pages Functions & Cloudflare KV (`TASKS_KV`).

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `[Space]` | Start / Pause timer |
| `[R]` | Reset timer to current interval |
| `[D]` | Toggle Dark / Light theme |

*(Shortcuts are automatically suppressed when typing inside input fields).*

---

## 🛠️ Tech Stack

- **Frontend**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vitejs.dev/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Charts**: [Recharts](https://recharts.org/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Audio**: Web Audio API (Synthesizers & 8-bit alerts) + YouTube Iframe Player API
- **Backend / Edge Functions**:
  - Local Dev & Container: Node.js + [Express](https://expressjs.com/) (`server.ts`)
  - Cloudflare Pages: [Cloudflare Pages Functions](https://developers.cloudflare.com/pages/platform/functions/) (`/functions/api/tasks.ts`) + [Cloudflare KV](https://developers.cloudflare.com/kv/) (`TASKS_KV`)
- **Testing**: Node.js native test runner (`node:test`, `node:assert/strict`)

---

## 🚀 Getting Started Locally

### Prerequisites
- Node.js 23.6+ (tests use the native test runner on `.ts` files, which requires TypeScript type stripping)

### Installation
```bash
# Clone the repository
git clone https://github.com/<your-username>/<your-repo-name>.git
cd <your-repo-name>

# Install dependencies
npm install

# Start the full-stack dev server (port 3000)
npm run dev
```

Visit `http://localhost:3000` in your browser.

### Typecheck
```bash
npm run lint   # runs tsc --noEmit; there is no ESLint
```

### Running Unit Tests
```bash
npm test
# Or directly via Node's native test runner:
node --test src/utils/*.test.ts
```

### Production Build
```bash
npm run build
```

---

## ☁️ Cloudflare Pages Hosting (Subdomain Deployment)

For a complete step-by-step walkthrough on how to host this application on a subdomain of your Cloudflare domain (e.g., `pomo.yourdomain.com`) connected to a GitHub repository with global KV task sync, see:

👉 **[CLOUDFLARE_WALKTHROUGH.md](./CLOUDFLARE_WALKTHROUGH.md)**

---

## 📄 License
Apache-2.0
