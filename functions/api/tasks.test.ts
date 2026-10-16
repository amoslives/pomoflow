import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet, onRequestOptions, onRequestPost } from './tasks.ts';

function context(request: Request, kv?: Map<string, string>) {
  return {
    request,
    env: kv ? {
      TASKS_KV: {
        get: async (key: string) => kv.get(key) ?? null,
        put: async (key: string, value: string) => { kv.set(key, value); },
        delete: async (key: string) => { kv.delete(key); },
      },
    } : {},
    params: {},
  };
}

const credential = 'pf-0123456789abcdefghij';
const task = { id: 'task-1', title: 'Safe task', completed: false, createdAt: 1 };

test('task API fails closed when KV is unavailable', async () => {
  const response = await onRequestPost(context(new Request('https://pomoflow.pages.dev/api/tasks', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credential}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tasks: [task] }),
  })));

  assert.equal(response.status, 503);
});

test('task API rejects cross-origin writes', async () => {
  const response = await onRequestPost(context(new Request('https://pomoflow.pages.dev/api/tasks', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credential}`,
      Origin: 'https://attacker.example',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tasks: [task] }),
  }), new Map()));

  assert.equal(response.status, 403);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
});

test('task API validates task records and payload size', async () => {
  const response = await onRequestPost(context(new Request('https://pomoflow.pages.dev/api/tasks', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credential}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tasks: [{ id: 'bad', title: { html: '<img>' } }] }),
  }), new Map()));

  assert.equal(response.status, 400);
});

test('task API uses bearer credentials and marks task data no-store', async () => {
  const kv = new Map<string, string>();
  const post = await onRequestPost(context(new Request('https://pomoflow.pages.dev/api/tasks', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credential}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tasks: [task] }),
  }), kv));
  assert.equal(post.status, 200);
  assert.equal(post.headers.get('Cache-Control'), 'no-store');

  const get = await onRequestGet(context(new Request('https://pomoflow.pages.dev/api/tasks', {
    headers: { Authorization: `Bearer ${credential}` },
  }), kv));
  assert.equal(get.status, 200);
  assert.equal(get.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual((await get.json()).tasks, [task]);
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
