import { isValidSyncKey, normalizeSyncKey } from '../../src/utils/sync.ts';

interface Env {
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

interface StoredTask {
  id: string;
  title: string;
  completed: boolean;
  createdAt: number;
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
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(request),
  });
}

function getCredential(request: Request, fallback?: unknown): string {
  const authorization = request.headers.get('Authorization');
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  return normalizeSyncKey(bearer || (typeof fallback === 'string' ? fallback : ''));
}

function isStoredTask(value: unknown): value is StoredTask {
  if (!value || typeof value !== 'object') return false;
  const task = value as Partial<StoredTask>;
  return typeof task.id === 'string'
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

function validateTasks(value: unknown): value is StoredTask[] {
  return Array.isArray(value)
    && value.length <= MAX_TASKS
    && value.every(isStoredTask)
    && new TextEncoder().encode(JSON.stringify(value)).byteLength <= MAX_PAYLOAD_BYTES;
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
  if (!context.env.TASKS_KV) return unavailableStorage(context.request);

  const url = new URL(context.request.url);
  const requestedKey = url.searchParams.get('key')?.trim();
  const key = getCredential(context.request, requestedKey);
  if (!key || !isValidSyncKey(key)) {
    return jsonResponse(context.request, { error: 'A valid sync credential is required' }, 401);
  }

  try {
    let raw = await context.env.TASKS_KV.get(`tasks:${key}`);
    if (!raw && requestedKey && normalizeSyncKey(requestedKey) !== requestedKey) {
      raw = await context.env.TASKS_KV.get(`tasks:${requestedKey}`);
    }
    if (!raw) {
      return jsonResponse(context.request, { tasks: [], updatedAt: Date.now() });
    }

    const stored = JSON.parse(raw);
    if (!validateTasks(stored?.tasks)) {
      return jsonResponse(context.request, { error: 'Stored task data is invalid' }, 500);
    }
    return jsonResponse(context.request, {
      tasks: stored.tasks,
      updatedAt: typeof stored.updatedAt === 'number' ? stored.updatedAt : Date.now(),
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
  if (!context.env.TASKS_KV) return unavailableStorage(context.request);

  try {
    const body: unknown = await context.request.json();
    const record = body && typeof body === 'object' ? body as { key?: unknown; tasks?: unknown } : {};
    const key = getCredential(context.request, record.key);
    if (!key || !isValidSyncKey(key)) {
      return jsonResponse(context.request, { error: 'A valid sync credential is required' }, 401);
    }
    if (!validateTasks(record.tasks)) {
      return jsonResponse(context.request, {
        error: `Tasks must contain at most ${MAX_TASKS} valid records and ${MAX_PAYLOAD_BYTES} bytes`,
      }, 400);
    }

    const payload = { tasks: record.tasks, updatedAt: Date.now() };
    await context.env.TASKS_KV.put(`tasks:${key}`, JSON.stringify(payload));

    return jsonResponse(context.request, {
      success: true,
      count: record.tasks.length,
      updatedAt: payload.updatedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error saving tasks';
    return jsonResponse(context.request, { error: message }, 500);
  }
}
