import { normalizeSyncKey } from '../../src/utils/sync.ts';

/**
 * Cloudflare Pages Function: /api/tasks
 * Automatically executed on Cloudflare Pages when deployed!
 * Connects to Cloudflare KV namespace binding 'TASKS_KV'
 */

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

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function onRequestGet(context: EventContext): Promise<Response> {
  const url = new URL(context.request.url);
  const requestedKey = url.searchParams.get('key')?.trim();

  if (!requestedKey) {
    return new Response(JSON.stringify({ error: 'Missing key parameter' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const key = normalizeSyncKey(requestedKey);

  try {
    if (context.env.TASKS_KV) {
      let raw = await context.env.TASKS_KV.get(`tasks:${key}`);
      if (!raw && requestedKey !== key) {
        raw = await context.env.TASKS_KV.get(`tasks:${requestedKey}`);
      }
      if (raw) {
        return new Response(raw, {
          status: 200,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({ tasks: [], updatedAt: Date.now() }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Internal Cloudflare KV error' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
}

export async function onRequestPost(context: EventContext): Promise<Response> {
  try {
    const body: any = await context.request.json();
    const requestedKey = body?.key?.trim();
    const tasks = body?.tasks;

    if (!requestedKey || !Array.isArray(tasks)) {
      return new Response(JSON.stringify({ error: 'Payload must contain string key and array of tasks' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const key = normalizeSyncKey(requestedKey);

    const payload = {
      key,
      tasks,
      updatedAt: Date.now(),
    };

    if (context.env.TASKS_KV) {
      await context.env.TASKS_KV.put(`tasks:${key}`, JSON.stringify(payload));
    }

    return new Response(JSON.stringify({ success: true, count: tasks.length, updatedAt: payload.updatedAt }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Error saving to Cloudflare' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
}
