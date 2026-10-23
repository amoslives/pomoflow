import { hashCredential, isLegacyKey, isLegacySecureKey, MAX_SYNC_BYTES, validEncryptedTasks } from '../../src/utils/sync.ts';
import { normalizeTasks } from '../../src/utils/tasks.ts';

export interface D1Database {
  prepare(query: string): {
    bind(...values: unknown[]): ReturnType<D1Database['prepare']>;
    first<T = Record<string, unknown>>(): Promise<T | null>;
    run(): Promise<unknown>;
  };
}
interface Env {
  TASKS_DB?: D1Database;
  TASKS_KV?: { get(key: string): Promise<string | null>; delete(key: string): Promise<void> };
  // Requests allowed per client IP per minute; 120 unless set. Only the local test server raises it.
  TASKS_RATE_LIMIT?: string;
}
interface EventContext { request: Request; env: Env; params: Record<string, string> }
interface Room { tasks_json: string; revision: number; updated_at: number; revoked_at: number | null }

function allowedOrigin(request: Request) {
  return !request.headers.get('Origin') || request.headers.get('Origin') === new URL(request.url).origin;
}
function json(request: Request, body: unknown, status = 200) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    'Permissions-Policy': 'camera=(), geolocation=(), microphone=()', 'Referrer-Policy': 'no-referrer',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', Vary: 'Origin',
  };
  if (request.headers.has('Origin') && allowedOrigin(request)) {
    headers['Access-Control-Allow-Origin'] = request.headers.get('Origin')!;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, DELETE, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type, If-Match';
  }
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}
const revoked = (request: Request) => json(request, { error: 'This pairing key was revoked. Pair again using the new link.' }, 410);
const getRoom = (db: D1Database, hash: string) => db.prepare(
  'SELECT tasks_json, revision, updated_at, revoked_at FROM task_rooms WHERE credential_hash = ?1'
).bind(hash).first<Room>();

async function rateLimit(request: Request, db: D1Database, limit: number): Promise<Response | null> {
  const now = Date.now();
  const client = await hashCredential(request.headers.get('CF-Connecting-IP') || 'unknown');
  await db.prepare('DELETE FROM task_rate_limits WHERE client_hash IN (SELECT client_hash FROM task_rate_limits WHERE expires_at <= ?1 LIMIT 100)').bind(now).run();
  const bucket = await db.prepare(`INSERT INTO task_rate_limits (client_hash, count, expires_at)
    VALUES (?1, 1, ?2) ON CONFLICT(client_hash) DO UPDATE SET
    count = CASE WHEN expires_at <= ?3 THEN 1 ELSE count + 1 END,
    expires_at = CASE WHEN expires_at <= ?3 THEN ?2 ELSE expires_at END
    RETURNING count, expires_at`).bind(client, now + 60_000, now).first<{ count: number; expires_at: number }>();
  if (!bucket || bucket.count <= limit) return null;
  const response = json(request, { error: 'Too many requests' }, 429);
  response.headers.set('Retry-After', String(Math.max(1, Math.ceil((bucket.expires_at - now) / 1000))));
  return response;
}

async function readBody(request: Request) {
  if (Number(request.headers.get('Content-Length')) > MAX_SYNC_BYTES + 1024) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > MAX_SYNC_BYTES + 1024) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { return null; }
}

export async function handleTaskRequest({ request, env }: EventContext): Promise<Response> {
  if (!allowedOrigin(request)) return json(request, { error: 'Cross-origin requests are not allowed' }, 403);
  if (request.method === 'OPTIONS') return json(request, null, 204);
  const db = env.TASKS_DB;
  if (!db) return json(request, { error: 'Task storage is unavailable' }, 503);
  try {
    const limited = await rateLimit(request, db, Number(env.TASKS_RATE_LIMIT) || 120);
    if (limited) return limited;
    // No credential-bearing query parameters or request-body fallback.
    const credential = request.headers.get('Authorization')?.match(/^Bearer\s+([^\s]+)$/i)?.[1] || '';
    const encrypted = /^v2-[a-f0-9]{64}$/.test(credential);
    const legacy = isLegacySecureKey(credential);
    const mayRevokeLegacy = request.method === 'DELETE' && isLegacyKey(credential);
    if (!encrypted && !legacy && !mayRevokeLegacy) return json(request, { error: 'A generated sync credential is required' }, 401);
    const hash = await hashCredential(credential);

    if (request.method === 'DELETE') {
      const expected = request.headers.get('If-Match');
      if (expected !== null) {
        if (!/^\d+$/.test(expected)) return json(request, { error: 'Invalid expected revision' }, 400);
        const revision = Number(expected);
        const previous = await getRoom(db, hash);
        if (previous?.revoked_at != null) {
          if (!encrypted) await env.TASKS_KV?.delete(`tasks:${credential}`);
          return json(request, { success: true });
        }
        const deleted = revision === 0 && !previous
          ? await db.prepare(`INSERT OR IGNORE INTO task_rooms (credential_hash, tasks_json, revision, updated_at, revoked_at)
              VALUES (?1, '[]', 1, ?2, ?2) RETURNING revision`).bind(hash, Date.now()).first()
          : await db.prepare(`UPDATE task_rooms SET tasks_json = '[]', revision = revision + 1, updated_at = ?2, revoked_at = ?2
              WHERE credential_hash = ?1 AND revision = ?3 AND revoked_at IS NULL RETURNING revision`).bind(hash, Date.now(), revision).first();
        if (!deleted) return json(request, { error: 'The room changed during rotation. Retry to include the latest tasks.' }, 409);
        if (!encrypted) await env.TASKS_KV?.delete(`tasks:${credential}`);
        return json(request, { success: true });
      }
      // Keep the hash permanently. A late write or a device still polling cannot
      // recreate the room; this upsert also revokes a previously unknown key.
      await db.prepare(`INSERT INTO task_rooms (credential_hash, tasks_json, revision, updated_at, revoked_at)
        VALUES (?1, '[]', 1, ?2, ?2) ON CONFLICT(credential_hash) DO UPDATE SET
        tasks_json = '[]', revision = revision + 1, updated_at = ?2, revoked_at = ?2`).bind(hash, Date.now()).run();
      if (!encrypted) await env.TASKS_KV?.delete(`tasks:${credential}`);
      return json(request, { success: true });
    }

    let room = await getRoom(db, hash);
    if (room?.revoked_at != null) return revoked(request);
    // Legacy rooms are read-only recovery sources. Remove KV's plaintext copy
    // after the D1 insert succeeds; new writes must use the encrypted protocol.
    if (legacy && !room && env.TASKS_KV) {
      const raw = await env.TASKS_KV.get(`tasks:${credential}`);
      if (raw) {
        const tasks = normalizeTasks(JSON.parse(raw)?.tasks);
        await db.prepare(`INSERT OR IGNORE INTO task_rooms (credential_hash, tasks_json, revision, updated_at)
          VALUES (?1, ?2, 1, ?3)`).bind(hash, JSON.stringify(tasks), Date.now()).run();
        room = await getRoom(db, hash);
      }
    }
    if (legacy && room) await env.TASKS_KV?.delete(`tasks:${credential}`);
    if (room?.revoked_at != null) return revoked(request);

    const snapshot = (value: Room | null) => ({
      ...(encrypted ? { encrypted: value ? JSON.parse(value.tasks_json) : null } : { tasks: value ? normalizeTasks(JSON.parse(value.tasks_json)) : [] }),
      revision: value?.revision ?? 0, updatedAt: value?.updated_at ?? Date.now(),
    });
    if (request.method === 'GET') return json(request, snapshot(room));
    if (request.method !== 'POST') return json(request, { error: 'Method not allowed' }, 405);
    if (!encrypted) return json(request, { error: 'Legacy sync is read-only. Rotate to an encrypted pairing key.' }, 426);
    const body = await readBody(request);
    if (!body || !validEncryptedTasks(body.encrypted) || !Number.isSafeInteger(body.baseRevision) || body.baseRevision < 0) {
      return json(request, { error: 'A bounded encrypted document and base revision are required' }, 400);
    }
    const updatedAt = Date.now();
    let saved: { revision: number } | null = null;
    if (!room && body.baseRevision === 0) {
      saved = await db.prepare(`INSERT OR IGNORE INTO task_rooms (credential_hash, tasks_json, revision, updated_at)
        VALUES (?1, ?2, 1, ?3) RETURNING revision`).bind(hash, JSON.stringify(body.encrypted), updatedAt).first<{ revision: number }>();
    } else if (room && body.baseRevision === room.revision) {
      saved = await db.prepare(`UPDATE task_rooms SET tasks_json = ?1, revision = revision + 1, updated_at = ?2
        WHERE credential_hash = ?3 AND revision = ?4 AND revoked_at IS NULL RETURNING revision`)
        .bind(JSON.stringify(body.encrypted), updatedAt, hash, body.baseRevision).first<{ revision: number }>();
    }
    if (!saved) {
      const latest = await getRoom(db, hash);
      if (latest?.revoked_at != null) return revoked(request);
      return json(request, { error: 'Sync conflict', ...snapshot(latest) }, 409);
    }
    return json(request, { success: true, revision: saved.revision, updatedAt });
  } catch {
    return json(request, { error: 'Task storage is unavailable. Try again shortly.' }, 503);
  }
}

export const onRequestGet = handleTaskRequest;
export const onRequestPost = handleTaskRequest;
export const onRequestDelete = handleTaskRequest;
export const onRequestOptions = handleTaskRequest;
