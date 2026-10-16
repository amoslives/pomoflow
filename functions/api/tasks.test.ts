import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestDelete, onRequestGet, onRequestOptions, onRequestPost } from './tasks.ts';

interface Room {
  tasks_json: string;
  revision: number;
  updated_at: number;
}

class FakeD1 {
  rooms = new Map<string, Room>();

  prepare(query: string) {
    let values: unknown[] = [];
    const statement = {
      bind: (...nextValues: unknown[]) => {
        values = nextValues;
        return statement;
      },
      first: async <T>() => {
        if (query.includes('SELECT tasks_json')) {
          return (this.rooms.get(String(values[0])) || null) as T | null;
        }
        if (query.includes('INSERT OR IGNORE')) {
          const key = String(values[0]);
          if (this.rooms.has(key)) return null;
          this.rooms.set(key, {
            tasks_json: String(values[1]),
            revision: 1,
            updated_at: Number(values[2]),
          });
          return { revision: 1 } as T;
        }
        if (query.includes('UPDATE task_rooms')) {
          const key = String(values[2]);
          const expectedRevision = Number(values[3]);
          const current = this.rooms.get(key);
          if (!current || current.revision !== expectedRevision) return null;
          const revision = current.revision + 1;
          this.rooms.set(key, {
            tasks_json: String(values[0]),
            revision,
            updated_at: Number(values[1]),
          });
          return { revision } as T;
        }
        if (query.includes('DELETE FROM task_rooms')) {
          const key = String(values[0]);
          const existed = this.rooms.delete(key);
          return (existed ? { credential_hash: key } : null) as T | null;
        }
        throw new Error(`Unsupported SQL in fake D1: ${query}`);
      },
    };
    return statement;
  }
}

function context(request: Request, db?: FakeD1, kv?: Map<string, string>) {
  return {
    request,
    env: {
      ...(db ? { TASKS_DB: db } : {}),
      ...(kv ? {
        TASKS_KV: {
          get: async (key: string) => kv.get(key) ?? null,
          put: async (key: string, value: string) => { kv.set(key, value); },
          delete: async (key: string) => { kv.delete(key); },
        },
      } : {}),
    },
    params: {},
  };
}

const credential = 'pf-0123456789abcdefghij';
const task = { id: 'task-1', title: 'Safe task', completed: false, createdAt: 1, updatedAt: 1 };

function taskRequest(tasks: unknown, baseRevision = 0, origin?: string): Request {
  return new Request('https://pomoflow.pages.dev/api/tasks', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credential}`,
      'Content-Type': 'application/json',
      ...(origin ? { Origin: origin } : {}),
    },
    body: JSON.stringify({ tasks, baseRevision }),
  });
}

test('task API fails closed when D1 is unavailable', async () => {
  const response = await onRequestPost(context(taskRequest([task])));
  assert.equal(response.status, 503);
});

test('task API rejects cross-origin writes', async () => {
  const response = await onRequestPost(context(
    taskRequest([task], 0, 'https://attacker.example'),
    new FakeD1()
  ));
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
});

test('task API validates task records and payload size', async () => {
  const response = await onRequestPost(context(
    taskRequest([{ id: 'bad', title: { html: '<img>' } }]),
    new FakeD1()
  ));
  assert.equal(response.status, 400);
});

test('task API stores revisions and marks task data no-store', async () => {
  const db = new FakeD1();
  const post = await onRequestPost(context(taskRequest([task]), db));
  assert.equal(post.status, 200);
  assert.equal(post.headers.get('Cache-Control'), 'no-store');
  assert.equal((await post.json()).revision, 1);

  const get = await onRequestGet(context(new Request('https://pomoflow.pages.dev/api/tasks', {
    headers: { Authorization: `Bearer ${credential}` },
  }), db));
  assert.equal(get.status, 200);
  assert.equal(get.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await get.json().then(({ tasks, revision }) => ({ tasks, revision })), {
    tasks: [task],
    revision: 1,
  });
});

test('task API rejects stale revisions with the latest room state', async () => {
  const db = new FakeD1();
  await onRequestPost(context(taskRequest([task]), db));
  const updated = { ...task, title: 'Newer title', updatedAt: 2 };
  const firstWriter = await onRequestPost(context(taskRequest([updated], 1), db));
  assert.equal(firstWriter.status, 200);
  assert.equal((await firstWriter.json()).revision, 2);

  const staleWriter = await onRequestPost(context(taskRequest([task], 1), db));
  assert.equal(staleWriter.status, 409);
  const conflict = await staleWriter.json();
  assert.equal(conflict.revision, 2);
  assert.deepEqual(conflict.tasks, [updated]);
});

test('task API migrates a legacy KV room into D1 while preserving rollback data', async () => {
  const db = new FakeD1();
  const kv = new Map([[`tasks:${credential}`, JSON.stringify({
    tasks: [{ id: 'legacy', title: 'Legacy', completed: false, createdAt: 5 }],
    updatedAt: 5,
  })]]);
  const get = await onRequestGet(context(new Request(`https://pomoflow.pages.dev/api/tasks?key=${credential}`), db, kv));
  const body = await get.json();
  assert.equal(get.status, 200);
  assert.equal(body.revision, 1);
  assert.equal(body.tasks[0].updatedAt, 5);
  assert.equal(kv.has(`tasks:${credential}`), true);
});

test('task API preflight allows only its own origin', async () => {
  const allowed = await onRequestOptions(context(new Request('https://pomoflow.pages.dev/api/tasks', {
    method: 'OPTIONS',
    headers: { Origin: 'https://pomoflow.pages.dev' },
  })));
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), 'https://pomoflow.pages.dev');

  const denied = await onRequestOptions(context(new Request('https://pomoflow.pages.dev/api/tasks', {
    method: 'OPTIONS',
    headers: { Origin: 'https://attacker.example' },
  })));
  assert.equal(denied.status, 403);
});

test('task API revokes a sync room and its legacy KV fallback', async () => {
  const db = new FakeD1();
  const kv = new Map<string, string>();
  await onRequestPost(context(taskRequest([task]), db, kv));
  kv.set(`tasks:${credential}`, JSON.stringify({ tasks: [task], updatedAt: 1 }));

  const response = await onRequestDelete(context(new Request('https://pomoflow.pages.dev/api/tasks', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${credential}` },
  }), db, kv));
  assert.equal(response.status, 200);
  assert.equal(kv.has(`tasks:${credential}`), false);

  const get = await onRequestGet(context(new Request('https://pomoflow.pages.dev/api/tasks', {
    headers: { Authorization: `Bearer ${credential}` },
  }), db, kv));
  assert.deepEqual(await get.json().then(({ tasks, revision }) => ({ tasks, revision })), {
    tasks: [],
    revision: 0,
  });
});

test('task API rate limits abusive request bursts by Cloudflare client IP', async () => {
  const db = new FakeD1();
  const makeRequest = () => new Request('https://pomoflow.pages.dev/api/tasks', {
    headers: {
      Authorization: `Bearer ${credential}`,
      'CF-Connecting-IP': '192.0.2.99',
    },
  });

  for (let count = 0; count < 120; count += 1) {
    const response = await onRequestGet(context(makeRequest(), db));
    assert.notEqual(response.status, 429);
  }
  const blocked = await onRequestGet(context(makeRequest(), db));
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('Retry-After')) >= 1);
});
