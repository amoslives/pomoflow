import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { normalizeSyncKey } from './src/utils/sync.ts';

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

function saveStore() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch {}
}

// API Routes
app.get('/api/tasks', (req, res) => {
  const requestedKey = (req.query.key as string || '').trim();
  if (!requestedKey) {
    return res.status(400).json({ error: 'Missing key parameter' });
  }

  const key = normalizeSyncKey(requestedKey);
  const record = store[key]
    || (requestedKey !== key ? store[requestedKey] : undefined)
    || { tasks: [], updatedAt: Date.now() };
  return res.json(record);
});

app.post('/api/tasks', (req, res) => {
  const { key, tasks } = req.body;
  const requestedKey = (key || '').trim();

  if (!requestedKey || !Array.isArray(tasks)) {
    return res.status(400).json({ error: 'Payload must contain string key and array of tasks' });
  }

  const normalizedKey = normalizeSyncKey(requestedKey);

  const payload = {
    tasks,
    updatedAt: Date.now(),
  };

  store[normalizedKey] = payload;
  saveStore();

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
