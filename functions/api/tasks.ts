import { isValidSyncKey, normalizeSyncKey } from '../../src/utils/sync.ts';
import { normalizeTasks, type Task } from '../../src/utils/tasks.ts';

interface D1PreparedStatement {
  bind: (...values: unknown[]) => D1PreparedStatement;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
}

interface D1Database {
  prepare: (query: string) => D1PreparedStatement;
}

interface Env {
  TASKS_DB?: D1Database;
  TASKS_KV?: {
    get: (key: string) => Promise<string | null>;
    put: (key: string, value: string) => Promise<void>;
    delete: (key: string) => Promise<void>;
  };
}

interface EventContext {
  request: Request;
  env: Env;
  params: Record<string, string>;
}

interface TaskRoom {
  tasks_json: string;
  revision: number;
  updated_at: number;
}

const MAX_TASKS = 500;
const MAX_PAYLOAD_BYTES = 256 * 1024;

function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin;
}

function responseHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    'Content-Type': 'application/json; charset=utf-8',
    'Permissions-Policy': 'camera=(), geolocation=(), microphone=()',
    'Referrer-Policy': 'no-referrer',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Vary': 'Origin',
  };
  const origin = request.headers.get('Origin');
  if (origin && isAllowedOrigin(request)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
  }
  return headers;
}

function jsonResponse(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders(request) });
}

function getCredential(request: Request, fallback?: unknown): string {
  const authorization = request.headers.get('Authorization');
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  return normalizeSyncKey(bearer || (typeof fallback === 'string' ? fallback : ''));
}

function validateTasks(value: unknown): Task[] | null {
  if (!Array.isArray(value) || value.length > MAX_TASKS) return null;
  const tasks = normalizeTasks(value);
  if (tasks.length !== value.length) return null;
  if (tasks.some((task) => task.id.length > 128 || task.title.length > 500)) return null;
  if (new TextEncoder().encode(JSON.stringify(tasks)).byteLength > MAX_PAYLOAD_BYTES) return null;
  return tasks;
}

async function hashCredential(credential: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(credential));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function getRoom(db: D1Database, credentialHash: string): Promise<TaskRoom | null> {
  return db.prepare(
    'SELECT tasks_json, revision, updated_at FROM task_rooms WHERE credential_hash = ?1'
  ).bind(credentialHash).first<TaskRoom>();
}

async function migrateLegacyRoom(
  env: Env,
  credential: string,
  requestedKey?: string
): Promise<TaskRoom | null> {
  if (!env.TASKS_DB || !env.TASKS_KV) return null;

  let raw = await env.TASKS_KV.get(`tasks:${credential}`);
  let legacyStorageKey = `tasks:${credential}`;
  if (!raw && requestedKey && requestedKey !== credential) {
    raw = await env.TASKS_KV.get(`tasks:${requestedKey}`);
    legacyStorageKey = `tasks:${requestedKey}`;
  }
  if (!raw) return null;

  const legacy = JSON.parse(raw);
  const tasks = validateTasks(legacy?.tasks);
  if (!tasks) throw new Error('Legacy task data is invalid');

  const credentialHash = await hashCredential(credential);
  const updatedAt = typeof legacy.updatedAt === 'number' ? legacy.updatedAt : Date.now();
  await env.TASKS_DB.prepare(
    `INSERT OR IGNORE INTO task_rooms (credential_hash, tasks_json, revision, updated_at)
     VALUES (?1, ?2, 1, ?3) RETURNING revision`
  ).bind(credentialHash, JSON.stringify(tasks), updatedAt).first();

  const room = await getRoom(env.TASKS_DB, credentialHash);
  if (room) await env.TASKS_KV.delete(legacyStorageKey);
  return room;
}

function unavailableStorage(request: Request): Response {
  return jsonResponse(request, { error: 'Task storage is unavailable' }, 503);
}

export async function onRequestOptions(context: EventContext): Promise<Response> {
  if (!isAllowedOrigin(context.request)) {
    return jsonResponse(context.request, { error: 'Cross-origin requests are not allowed' }, 403);
  }
  return new Response(null, { status: 204, headers: responseHeaders(context.request) });
}

export async function onRequestGet(context: EventContext): Promise<Response> {
  if (!context.env.TASKS_DB) return unavailableStorage(context.request);

  const url = new URL(context.request.url);
  const requestedKey = url.searchParams.get('key')?.trim();
  const credential = getCredential(context.request, requestedKey);
  if (!credential || !isValidSyncKey(credential)) {
    return jsonResponse(context.request, { error: 'A valid sync credential is required' }, 401);
  }

  try {
    const credentialHash = await hashCredential(credential);
    let room = await getRoom(context.env.TASKS_DB, credentialHash);
    if (!room) room = await migrateLegacyRoom(context.env, credential, requestedKey);
    if (!room) {
      return jsonResponse(context.request, { tasks: [], revision: 0, updatedAt: Date.now() });
    }

    const tasks = validateTasks(JSON.parse(room.tasks_json));
    if (!tasks) return jsonResponse(context.request, { error: 'Stored task data is invalid' }, 500);
    return jsonResponse(context.request, {
      tasks,
      revision: room.revision,
      updatedAt: room.updated_at,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal task storage error';
    return jsonResponse(context.request, { error: message }, 500);
  }
}

export async function onRequestPost(context: EventContext): Promise<Response> {
  if (!isAllowedOrigin(context.request)) {
    return jsonResponse(context.request, { error: 'Cross-origin requests are not allowed' }, 403);
  }
  if (!context.env.TASKS_DB) return unavailableStorage(context.request);

  try {
    const body: unknown = await context.request.json();
    const record = body && typeof body === 'object'
      ? body as { key?: unknown; tasks?: unknown; baseRevision?: unknown }
      : {};
    const credential = getCredential(context.request, record.key);
    if (!credential || !isValidSyncKey(credential)) {
      return jsonResponse(context.request, { error: 'A valid sync credential is required' }, 401);
    }
    const tasks = validateTasks(record.tasks);
    if (!tasks) {
      return jsonResponse(context.request, {
        error: `Tasks must contain at most ${MAX_TASKS} valid records and ${MAX_PAYLOAD_BYTES} bytes`,
      }, 400);
    }

    const credentialHash = await hashCredential(credential);
    let current = await getRoom(context.env.TASKS_DB, credentialHash);
    if (!current) current = await migrateLegacyRoom(context.env, credential);
    const suppliedRevision = Number.isInteger(record.baseRevision) && Number(record.baseRevision) >= 0
      ? Number(record.baseRevision)
      : current?.revision ?? 0; // Temporary compatibility for already-open legacy clients.
    const updatedAt = Date.now();
    let saved: { revision: number } | null;

    if (!current) {
      if (suppliedRevision !== 0) {
        return jsonResponse(context.request, { error: 'Sync conflict', tasks: [], revision: 0 }, 409);
      }
      saved = await context.env.TASKS_DB.prepare(
        `INSERT OR IGNORE INTO task_rooms (credential_hash, tasks_json, revision, updated_at)
         VALUES (?1, ?2, 1, ?3) RETURNING revision`
      ).bind(credentialHash, JSON.stringify(tasks), updatedAt).first<{ revision: number }>();
    } else {
      saved = suppliedRevision === current.revision
        ? await context.env.TASKS_DB.prepare(
          `UPDATE task_rooms
           SET tasks_json = ?1, revision = revision + 1, updated_at = ?2
           WHERE credential_hash = ?3 AND revision = ?4
           RETURNING revision`
        ).bind(JSON.stringify(tasks), updatedAt, credentialHash, suppliedRevision).first<{ revision: number }>()
        : null;
    }

    if (!saved) {
      const latest = await getRoom(context.env.TASKS_DB, credentialHash);
      const latestTasks = latest ? validateTasks(JSON.parse(latest.tasks_json)) : [];
      return jsonResponse(context.request, {
        error: 'Sync conflict',
        tasks: latestTasks || [],
        revision: latest?.revision ?? 0,
        updatedAt: latest?.updated_at ?? updatedAt,
      }, 409);
    }

    return jsonResponse(context.request, {
      success: true,
      count: tasks.length,
      revision: saved.revision,
      updatedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error saving tasks';
    return jsonResponse(context.request, { error: message }, 500);
  }
}
