import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { isValidSyncKey, normalizeSyncKey } from './src/utils/sync.ts';
import { normalizeTasks, type Task } from './src/utils/tasks.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);

app.use(express.json());

// In-memory + persistent fallback file for local tasks store
const DATA_DIR = path.join(__dirname, '.data');
const DATA_FILE = path.join(DATA_DIR, 'tasks.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let store: Record<string, { tasks: Task[]; updatedAt: number; revision?: number }> = {};
if (fs.existsSync(DATA_FILE)) {
  try {
    store = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {}
}

function saveStore(): boolean {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

const MAX_TASKS = 500;
const MAX_PAYLOAD_BYTES = 256 * 1024;
const RATE_LIMIT_REQUESTS = 120;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateLimitBuckets = new Map<string, { count: number; resetsAt: number }>();

function validateTasks(value: unknown): Task[] | null {
  if (!Array.isArray(value) || value.length > MAX_TASKS) return null;
  const tasks = normalizeTasks(value);
  return tasks.length === value.length
    && tasks.every((task) => task.id.length <= 128 && task.title.length <= 500)
    && Buffer.byteLength(JSON.stringify(tasks), 'utf8') <= MAX_PAYLOAD_BYTES
    ? tasks
    : null;
}

function getCredential(req: express.Request, fallback?: unknown): string {
  const bearer = req.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  return normalizeSyncKey(bearer || (typeof fallback === 'string' ? fallback : ''));
}

function isAllowedOrigin(req: express.Request): boolean {
  const origin = req.get('Origin');
  return !origin || origin === `${req.protocol}://${req.get('host')}`;
}

function setApiHeaders(req: express.Request, res: express.Response) {
  res.set({
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    'Permissions-Policy': 'camera=(), geolocation=(), microphone=()',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Vary': 'Origin',
  });
  const origin = req.get('Origin');
  if (origin && isAllowedOrigin(req)) {
    res.set({
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    });
  }
}

function rejectIfRateLimited(req: express.Request, res: express.Response): boolean {
  const now = Date.now();
  const client = req.get('CF-Connecting-IP') || req.ip || 'local';
  const current = rateLimitBuckets.get(client);
  const bucket = !current || current.resetsAt <= now
    ? { count: 1, resetsAt: now + RATE_LIMIT_WINDOW_MS }
    : { count: current.count + 1, resetsAt: current.resetsAt };
  rateLimitBuckets.set(client, bucket);
  if (bucket.count <= RATE_LIMIT_REQUESTS) return false;

  res.set('Retry-After', String(Math.max(1, Math.ceil((bucket.resetsAt - now) / 1000))));
  res.status(429).json({ error: 'Too many requests' });
  return true;
}

// API Routes
app.options('/api/tasks', (req, res) => {
  setApiHeaders(req, res);
  if (!isAllowedOrigin(req)) return res.status(403).json({ error: 'Cross-origin requests are not allowed' });
  return res.sendStatus(204);
});

app.get('/api/tasks', (req, res) => {
  setApiHeaders(req, res);
  if (rejectIfRateLimited(req, res)) return;
  const requestedKey = (req.query.key as string || '').trim();
  const key = getCredential(req, requestedKey);
  if (!key || !isValidSyncKey(key)) {
    return res.status(401).json({ error: 'A valid sync credential is required' });
  }

  const record = store[key]
    || (requestedKey !== key ? store[requestedKey] : undefined)
    || { tasks: [], updatedAt: Date.now(), revision: 0 };
  return res.json({
    tasks: normalizeTasks(record.tasks),
    updatedAt: record.updatedAt,
    revision: record.revision ?? 1,
  });
});

app.post('/api/tasks', (req, res) => {
  setApiHeaders(req, res);
  if (rejectIfRateLimited(req, res)) return;
  if (!isAllowedOrigin(req)) return res.status(403).json({ error: 'Cross-origin requests are not allowed' });

  const { key: requestedKey, tasks: rawTasks, baseRevision } = req.body || {};
  const normalizedKey = getCredential(req, requestedKey);

  if (!normalizedKey || !isValidSyncKey(normalizedKey)) {
    return res.status(401).json({ error: 'A valid sync credential is required' });
  }
  const tasks = validateTasks(rawTasks);
  if (!tasks) {
    return res.status(400).json({ error: 'Payload contains invalid tasks or exceeds its size limit' });
  }

  const current = store[normalizedKey];
  const currentRevision = current?.revision ?? (current ? 1 : 0);
  const suppliedRevision = Number.isInteger(baseRevision) && baseRevision >= 0
    ? baseRevision
    : currentRevision;
  if (suppliedRevision !== currentRevision) {
    return res.status(409).json({
      error: 'Sync conflict',
      tasks: normalizeTasks(current?.tasks || []),
      revision: currentRevision,
      updatedAt: current?.updatedAt || Date.now(),
    });
  }

  const payload = {
    tasks,
    updatedAt: Date.now(),
    revision: currentRevision + 1,
  };

  const previous = store[normalizedKey];
  store[normalizedKey] = payload;
  if (!saveStore()) {
    if (previous) store[normalizedKey] = previous;
    else delete store[normalizedKey];
    return res.status(500).json({ error: 'Could not persist tasks' });
  }

  return res.json({
    success: true,
    count: tasks.length,
    updatedAt: payload.updatedAt,
    revision: payload.revision,
  });
});

app.delete('/api/tasks', (req, res) => {
  setApiHeaders(req, res);
  if (rejectIfRateLimited(req, res)) return;
  if (!isAllowedOrigin(req)) return res.status(403).json({ error: 'Cross-origin requests are not allowed' });

  const credential = getCredential(req);
  if (!credential || !isValidSyncKey(credential)) {
    return res.status(401).json({ error: 'A valid sync credential is required' });
  }

  const previous = store[credential];
  delete store[credential];
  if (!saveStore()) {
    if (previous) store[credential] = previous;
    return res.status(500).json({ error: 'Could not revoke sync room' });
  }
  return res.json({ success: true });
});

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    // Match Cloudflare Pages: with a top-level 404.html, unknown paths get it with status 404.
    app.get('*', (_req, res) => {
      res.status(404).sendFile(path.join(__dirname, 'dist', '404.html'));
    });
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on port ${port}`);
  });
}

startServer();
