import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { isValidSyncKey, normalizeSyncKey } from './src/utils/sync.ts';

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

let store: Record<string, { tasks: any[]; updatedAt: number }> = {};
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

function isValidTask(task: any): boolean {
  return task
    && typeof task === 'object'
    && typeof task.id === 'string'
    && task.id.length > 0
    && task.id.length <= 128
    && typeof task.title === 'string'
    && task.title.trim().length > 0
    && task.title.length <= 500
    && typeof task.completed === 'boolean'
    && typeof task.createdAt === 'number'
    && Number.isFinite(task.createdAt)
    && task.createdAt >= 0;
}

function isValidTasks(tasks: unknown): tasks is any[] {
  return Array.isArray(tasks)
    && tasks.length <= MAX_TASKS
    && tasks.every(isValidTask)
    && Buffer.byteLength(JSON.stringify(tasks), 'utf8') <= MAX_PAYLOAD_BYTES;
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
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    });
  }
}

// API Routes
app.options('/api/tasks', (req, res) => {
  setApiHeaders(req, res);
  if (!isAllowedOrigin(req)) return res.status(403).json({ error: 'Cross-origin requests are not allowed' });
  return res.sendStatus(204);
});

app.get('/api/tasks', (req, res) => {
  setApiHeaders(req, res);
  const requestedKey = (req.query.key as string || '').trim();
  const key = getCredential(req, requestedKey);
  if (!key || !isValidSyncKey(key)) {
    return res.status(401).json({ error: 'A valid sync credential is required' });
  }

  const record = store[key]
    || (requestedKey !== key ? store[requestedKey] : undefined)
    || { tasks: [], updatedAt: Date.now() };
  return res.json(record);
});

app.post('/api/tasks', (req, res) => {
  setApiHeaders(req, res);
  if (!isAllowedOrigin(req)) return res.status(403).json({ error: 'Cross-origin requests are not allowed' });

  const { key: requestedKey, tasks } = req.body || {};
  const normalizedKey = getCredential(req, requestedKey);

  if (!normalizedKey || !isValidSyncKey(normalizedKey)) {
    return res.status(401).json({ error: 'A valid sync credential is required' });
  }
  if (!isValidTasks(tasks)) {
    return res.status(400).json({ error: 'Payload contains invalid tasks or exceeds its size limit' });
  }

  const payload = {
    tasks,
    updatedAt: Date.now(),
  };

  const previous = store[normalizedKey];
  store[normalizedKey] = payload;
  if (!saveStore()) {
    if (previous) store[normalizedKey] = previous;
    else delete store[normalizedKey];
    return res.status(500).json({ error: 'Could not persist tasks' });
  }

  return res.json({ success: true, count: tasks.length, updatedAt: payload.updatedAt });
});

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
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
