# Deploying Pomoflow on Cloudflare Pages

Pomoflow deploys from GitHub to Cloudflare Pages. Static assets come from `dist/`; `/functions/api/tasks.ts` provides revision-checked task sync backed by D1.

```text
GitHub (main) -> Cloudflare Pages -> static Vite app
                                -> /api/tasks -> D1 (TASKS_DB)
```

## 1. Create the D1 database

In **Cloudflare Dashboard > Storage & Databases > D1 SQL database**, create `pomoflow-sync` with read replication disabled. Run this in its SQL console:

```sql
CREATE TABLE IF NOT EXISTS task_rooms (
  credential_hash TEXT PRIMARY KEY,
  tasks_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
```

Put the database UUID in `wrangler.toml`:

```toml
[[d1_databases]]
binding = "TASKS_DB"
database_name = "pomoflow-sync"
database_id = "YOUR_D1_DATABASE_UUID"
```

`TASKS_KV` is not required for a new installation. This repository retains that binding only to migrate sync rooms created by older KV-backed versions.

## 2. Create the Pages project

In **Workers & Pages**, create a Pages application and connect its Git repository.

- Production branch: `main`
- Build command: `npm run build`
- Build output: `dist`
- Root directory: empty
- Optional build environment variable: `NODE_VERSION=22`

The committed `wrangler.toml` is the Pages configuration source of truth. After deployment, confirm the project’s production and preview bindings include `TASKS_DB`.

## 3. Verify the deployment

Open the generated `*.pages.dev` URL and generate a pairing key. Add a task, then verify the API with the same credential:

```bash
curl "https://YOUR_PROJECT.pages.dev/api/tasks" \
  -H "Authorization: Bearer YOUR_SYNC_KEY"
```

The response must include `tasks`, `revision`, and `updatedAt`. It must also include `Cache-Control: no-store`.

Open the Share Link on another device. The link transports the credential in `#sync=...`; Pomoflow imports it into local storage and immediately removes it from the address bar.

## 4. Add a custom domain (optional)

In the Pages project, open **Custom domains**, choose **Set up a custom domain**, and enter the exact hostname. Cloudflare creates the required DNS record and provisions TLS. Test the static app, YouTube playback, security headers, and `/api/tasks` again on the custom hostname.

## Troubleshooting

### `Task storage is unavailable`

- Confirm `TASKS_DB` exists in `wrangler.toml` with the correct UUID.
- Confirm the `task_rooms` schema exists.
- Redeploy after changing a binding.

### Sync conflict (HTTP 409)

The client normally merges the latest task versions and retries automatically. If it persists, inspect the response’s `revision` and `tasks`, then check the Pages Function logs.

### YouTube does not autoplay

Browsers require a user gesture before audio playback. Use the player’s Play button.
