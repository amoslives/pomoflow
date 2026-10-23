import test from 'node:test';
import assert from 'node:assert/strict';
import { handleTaskRequest, type D1Database } from './tasks.ts';
import { localDatabase } from '../../tooling/local-database.ts';
import { decryptTasks, encryptDocument, generateSyncKey, hashCredential, syncCredential } from '../../src/utils/sync.ts';
import type { Task } from '../../src/utils/tasks.ts';

const encryptTasks = (key: string, tasks: Task[]) => encryptDocument(key, { tasks, stats: {}, settings: null });

const task = { id: 'task-1', title: 'Private task', completed: false, createdAt: 1, updatedAt: 1 };
const key = generateSyncKey();
const credential = await syncCredential(key);
function request(method = 'GET', body?: unknown, token = credential, headers: Record<string, string> = {}) {
  return new Request('https://pomoflow.pages.dev/api/tasks', { method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
function context(request: Request, db?: D1Database, kv?: Map<string, string>) {
  return { request, env: { TASKS_DB: db, ...(kv ? { TASKS_KV: {
    get: async (key: string) => kv.get(key) ?? null,
    delete: async (key: string) => { kv.delete(key); },
  } } : {}) }, params: {} };
}

test('task API fails closed without storage and rejects cross-origin requests', async () => {
  assert.equal((await handleTaskRequest(context(request()))).status, 503);
  assert.equal((await handleTaskRequest(context(request('POST', {}, credential, { Origin: 'https://other.example' })))).status, 403);
  const preflight = await handleTaskRequest(context(request('OPTIONS', undefined, credential, { Origin: 'https://pomoflow.pages.dev' })));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), 'https://pomoflow.pages.dev');
});

test('encrypted snapshots are revisioned and contain neither tasks nor the pairing secret', async t => {
  const { db, sqlite } = localDatabase(':memory:'); t.after(() => sqlite.close());
  const encrypted = await encryptTasks(key, [task]);
  const post = await handleTaskRequest(context(request('POST', { encrypted, baseRevision: 0 }), db));
  assert.equal(post.status, 200);
  assert.equal((await post.json()).revision, 1);
  const get = await handleTaskRequest(context(request(), db));
  assert.equal(get.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await decryptTasks(key, (await get.json()).encrypted), [task]);
  const stored = JSON.stringify(sqlite.prepare('SELECT * FROM task_rooms').all());
  assert.ok(!stored.includes(task.title)); assert.ok(!stored.includes(key)); assert.ok(!stored.includes(credential));
  const conflict = await handleTaskRequest(context(request('POST', { encrypted, baseRevision: 0 }), db));
  assert.equal(conflict.status, 409); assert.equal((await conflict.json()).revision, 1);
});

test('revocation persists and rejects stale writes and recreation at revision zero', async t => {
  const { db, sqlite } = localDatabase(':memory:'); t.after(() => sqlite.close());
  const encrypted = await encryptTasks(key, [task]);
  await handleTaskRequest(context(request('POST', { encrypted, baseRevision: 0 }), db));
  assert.equal((await handleTaskRequest(context(request('DELETE'), db))).status, 200);
  assert.equal((await handleTaskRequest(context(request(), db))).status, 410);
  for (const baseRevision of [0, 1, 2]) {
    assert.equal((await handleTaskRequest(context(request('POST', { encrypted, baseRevision }), { prepare: db.prepare }))).status, 410);
  }
  const row = sqlite.prepare('SELECT tasks_json FROM task_rooms').get();
  assert.equal(row?.tasks_json, '[]');
});

test('revoking an unknown key cannot race with room creation', async t => {
  const { db, sqlite } = localDatabase(':memory:'); t.after(() => sqlite.close());
  await handleTaskRequest(context(request('DELETE'), db));
  const response = await handleTaskRequest(context(request('POST', { encrypted: await encryptTasks(key, [task]), baseRevision: 0 }), db));
  assert.equal(response.status, 410);
});

test('rotation refuses to revoke a room edited after its snapshot was copied', async t => {
  const { db, sqlite } = localDatabase(':memory:'); t.after(() => sqlite.close());
  const encrypted = await encryptTasks(key, [task]);
  await handleTaskRequest(context(request('POST', { encrypted, baseRevision: 0 }), db));
  await handleTaskRequest(context(request('POST', { encrypted, baseRevision: 1 }), db));
  const stale = await handleTaskRequest(context(request('DELETE', undefined, credential, { 'If-Match': '1' }), db));
  assert.equal(stale.status, 409);
  assert.equal((await handleTaskRequest(context(request(), db))).status, 200);
  const fresh = await handleTaskRequest(context(request('DELETE', undefined, credential, { 'If-Match': '2' }), db));
  assert.equal(fresh.status, 200);
  assert.equal((await handleTaskRequest(context(request(), db))).status, 410);
});

test('weak, query-string, body-only, and plaintext write credentials are rejected', async t => {
  const { db, sqlite } = localDatabase(':memory:'); t.after(() => sqlite.close());
  assert.equal((await handleTaskRequest(context(request('GET', undefined, 'focus-2026'), db))).status, 401);
  assert.equal((await handleTaskRequest(context(new Request(`https://pomoflow.pages.dev/api/tasks?key=${credential}`), db))).status, 401);
  assert.equal((await handleTaskRequest(context(request('POST', { key: credential, tasks: [task] }, ''), db))).status, 401);
  assert.equal((await handleTaskRequest(context(request('POST', { tasks: [task], baseRevision: 0 }), db))).status, 400);
});

test('legacy recovery removes KV plaintext and revocation blocks all legacy fallbacks', async t => {
  const { db, sqlite } = localDatabase(':memory:'); t.after(() => sqlite.close());
  const legacyKey = 'pf-abcdefghijklmnopqrstuvwxyz';
  const kv = new Map([[`tasks:${legacyKey}`, JSON.stringify({ tasks: [task] })]]);
  const get = await handleTaskRequest(context(request('GET', undefined, legacyKey), db, kv));
  assert.deepEqual((await get.json()).tasks, [task]);
  assert.equal(kv.size, 0);
  assert.equal((await handleTaskRequest(context(request('POST', { tasks: [task] }, legacyKey), db, kv))).status, 426);
  await handleTaskRequest(context(request('DELETE', undefined, legacyKey), db, kv));
  kv.set(`tasks:${legacyKey}`, JSON.stringify({ tasks: [task] }));
  assert.equal((await handleTaskRequest(context(request('GET', undefined, legacyKey), db, kv))).status, 410);
});

test('rate limits are shared across independent request contexts and expire', async t => {
  const { db, sqlite } = localDatabase(':memory:'); t.after(() => sqlite.close());
  for (let i = 0; i < 120; i++) {
    const response = await handleTaskRequest(context(request(), { prepare: db.prepare }));
    assert.equal(response.status, 200);
  }
  const response = await handleTaskRequest(context(request(), { prepare: db.prepare }));
  assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get('Retry-After')) > 0);
  sqlite.prepare('UPDATE task_rate_limits SET expires_at = 0').run();
  assert.equal((await handleTaskRequest(context(request(), db))).status, 200);
  assert.equal(sqlite.prepare('SELECT client_hash FROM task_rate_limits').get()?.client_hash, await hashCredential('unknown'));
});

test('the rate limit can be set per environment', async t => {
  const { db, sqlite } = localDatabase(':memory:'); t.after(() => sqlite.close());
  const limited = () => handleTaskRequest({ ...context(request(), db), env: { TASKS_DB: db, TASKS_RATE_LIMIT: '2' } });
  assert.equal((await limited()).status, 200);
  assert.equal((await limited()).status, 200);
  assert.equal((await limited()).status, 429);
});

test('more than 500 tasks sync, and deleting them releases document space', async t => {
  const { db, sqlite } = localDatabase(':memory:'); t.after(() => sqlite.close());
  const many = Array.from({ length: 600 }, (_, i) => ({ ...task, id: `task-${i}`, title: '漢'.repeat(500) }));
  const encrypted = await encryptTasks(key, many);
  assert.equal((await handleTaskRequest(context(request('POST', { encrypted, baseRevision: 0 }), db))).status, 200);
  const empty = await encryptTasks(key, many.map(t => ({ ...t, deletedAt: 2 })));
  assert.equal((await handleTaskRequest(context(request('POST', { encrypted: empty, baseRevision: 1 }), db))).status, 200);
  const body = await (await handleTaskRequest(context(request(), db))).json();
  assert.deepEqual(await decryptTasks(key, body.encrypted), []);
});
