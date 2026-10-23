import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { handleTaskRequest } from './functions/api/tasks.ts';
import { localDatabase } from './tooling/local-database.ts';
import { hashCredential, normalizeSyncKey } from './src/utils/sync.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = parseInt(process.env.PORT || '3000', 10);
const directory = path.join(__dirname, '.data');
fs.mkdirSync(directory, { recursive: true });
const { db, sqlite } = localDatabase(path.join(directory, 'tasks.sqlite'));

// Import the old dev-only JSON store once. Keep the original file as a backup.
const legacyFile = path.join(directory, 'tasks.json');
if (fs.existsSync(legacyFile) && !sqlite.prepare('SELECT name FROM schema_migrations WHERE name = ?').get('legacy-json')) {
  const rooms = JSON.parse(fs.readFileSync(legacyFile, 'utf8'));
  for (const [key, value] of Object.entries(rooms)) {
    const room = value as { tasks: unknown; revision?: number; updatedAt: number };
    sqlite.prepare('INSERT OR IGNORE INTO task_rooms (credential_hash, tasks_json, revision, updated_at) VALUES (?, ?, ?, ?)')
      .run(await hashCredential(normalizeSyncKey(key)), JSON.stringify(room.tasks), room.revision ?? 1, room.updatedAt);
  }
  sqlite.prepare('INSERT INTO schema_migrations VALUES (?)').run('legacy-json');
}

// The development and Pages APIs execute the same handler and schema.
app.all('/api/tasks', express.raw({ type: () => true, limit: '2100kb' }), async (req, res) => {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  }
  // Never trust a client-supplied CF header on the local server.
  headers.set('CF-Connecting-IP', req.ip || 'local');
  const request = new Request(`${req.protocol}://${req.get('host')}${req.originalUrl}`, {
    method: req.method, headers,
    ...(req.method === 'GET' || req.method === 'HEAD' ? {} : { body: req.body?.length ? new Uint8Array(req.body) : undefined }),
  });
  const response = await handleTaskRequest({ request, env: { TASKS_DB: db, TASKS_RATE_LIMIT: process.env.TASKS_RATE_LIMIT }, params: {} });
  response.headers.forEach((value, name) => res.setHeader(name, value));
  res.status(response.status).send(await response.text());
});

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => res.status(404).sendFile(path.join(__dirname, 'dist', '404.html')));
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }
  app.listen(port, '0.0.0.0', () => console.log(`Server listening on port ${port}`));
}
startServer();
