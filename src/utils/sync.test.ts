import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidSyncKey, isSecureSyncKey, normalizeSyncKey, extractSyncKey, generateSyncKey, mergeTasks, applyPendingTasks,
  encryptDocument, decryptDocument, decryptTasks, syncCredential, generateDeviceId, isDeviceId, documentChanged, publishDocument,
  type SyncDocument,
} from './sync.ts';
import { createTask, type Task } from './tasks.ts';

const encryptTasks = (key: string, tasks: Task[]) => encryptDocument(key, { tasks, stats: {}, settings: null });

test('isValidSyncKey accepts valid keys and rejects invalid', () => {
  assert.equal(isValidSyncKey('focus-1234'), false);
  assert.equal(isValidSyncKey('my_secret_key_99'), false);
  assert.equal(isValidSyncKey('ab'), false); // too short
  assert.equal(isValidSyncKey(''), false);
  assert.equal(isValidSyncKey('has space in key'), false);
  assert.equal(isValidSyncKey('invalid@key!'), false);
});

test('generateSyncKey returns a formatted valid key', () => {
  const key = generateSyncKey();
  assert.ok(isValidSyncKey(key));
  assert.ok(isSecureSyncKey(key));
  assert.match(key, /^pf2-[a-z2-7]{26}$/);
});

test('generateSyncKey produces unique high-entropy credentials', () => {
  const keys = new Set(Array.from({ length: 100 }, () => generateSyncKey()));
  assert.equal(keys.size, 100);
});

test('normalizeSyncKey makes passphrases case-insensitive', () => {
  assert.equal(normalizeSyncKey(' LEGACY-ROOM-1234 '), 'legacy-room-1234');
  assert.equal(normalizeSyncKey('My_Secret_Key'), 'my_secret_key');
});

test('extractSyncKey accepts a bare key or a pasted pairing link', () => {
  const key = 'pf2-abcdefghijklmnopqrstuvwxyz';
  assert.equal(extractSyncKey(` ${key} `), key);
  assert.equal(extractSyncKey(`https://pomoflow.pages.dev/#sync=${key}`), key);
  assert.equal(isValidSyncKey(extractSyncKey(`https://pomoflow.pages.dev/?sync=${key}`)), false);
  assert.equal(extractSyncKey(`#sync=${encodeURIComponent(key)}`), key);
  assert.equal(isValidSyncKey(extractSyncKey(`sync=${key}`)), false);
  assert.equal(extractSyncKey(`https://pomoflow.pages.dev/?sync=old-room#sync=${key}`), key);
  assert.equal(extractSyncKey(`https://pomoflow.pages.dev/#theme=dark&sync=${key}`), key);
});

test('extractSyncKey leaves input without a key for validation to reject', () => {
  assert.equal(extractSyncKey('https://pomoflow.pages.dev/#sync='), 'https://pomoflow.pages.dev/#sync=');
  assert.equal(extractSyncKey('https://pomoflow.pages.dev/'), 'https://pomoflow.pages.dev/');
  assert.equal(isValidSyncKey(normalizeSyncKey(extractSyncKey('https://pomoflow.pages.dev/'))), false);
});

test('isSecureSyncKey distinguishes generated credentials from legacy passphrases', () => {
  assert.equal(isSecureSyncKey(generateSyncKey()), true);
  assert.equal(isSecureSyncKey('legacy-room-1234'), false);
});

test('mergeTasks merges distinct tasks from local and remote', () => {
  const local1 = createTask('Local Task 1');
  const remote1 = createTask('Remote Task 1');

  const merged = mergeTasks([local1], [remote1]);
  assert.equal(merged.length, 2);
  const titles = merged.map((t) => t.title);
  assert.ok(titles.includes('Local Task 1'));
  assert.ok(titles.includes('Remote Task 1'));
});

test('mergeTasks resolves duplicate task IDs without duplication', () => {
  const t1 = createTask('Task 1');
  const remoteT1 = { ...t1, title: 'Updated Task 1 remotely' };

  const merged = mergeTasks([t1], [remoteT1]);
  assert.equal(merged.length, 1);
});

test('mergeTasks keeps the newest task version regardless of device', () => {
  const local = { ...createTask('Old title'), id: 'shared', createdAt: 100, updatedAt: 100 };
  const remote = { ...local, title: 'Remote edit', completed: true, updatedAt: 200 };
  assert.deepEqual(mergeTasks([local], [remote]), [remote]);
  assert.deepEqual(mergeTasks([remote], [local]), [remote]);
});

test('mergeTasks preserves deletion tombstones instead of resurrecting tasks', () => {
  const active = { ...createTask('Delete me'), id: 'shared', createdAt: 100, updatedAt: 100 };
  const deleted = { ...active, updatedAt: 200, deletedAt: 200 };
  assert.deepEqual(mergeTasks([active], [deleted]), [deleted]);
  assert.deepEqual(mergeTasks([deleted], []), [deleted]);
});

test('authoritative snapshots do not resurrect deleted tasks from a stale baseline', () => {
  const old = { ...createTask('Deleted on another device'), id: 'old' };
  const addedOffline = { ...createTask('Added offline'), id: 'new' };
  assert.deepEqual(applyPendingTasks([], [addedOffline]), [addedOffline]);
  assert.deepEqual(applyPendingTasks([old], [{ ...old, title: '', deletedAt: 10 }]), []);
});

test('encryption authenticates ciphertext and keeps the server credential separate', async () => {
  const key = generateSyncKey();
  const tasks = [createTask('Private title')];
  const ciphertext = await encryptTasks(key, tasks);
  assert.deepEqual(await decryptTasks(key, ciphertext), tasks);
  assert.ok(!JSON.stringify(ciphertext).includes('Private title'));
  assert.notEqual(await syncCredential(key), key);
  await assert.rejects(decryptTasks(generateSyncKey(), ciphertext));
  await assert.rejects(decryptTasks(key, { ...ciphertext, data: `${ciphertext.data[0] === 'A' ? 'B' : 'A'}${ciphertext.data.slice(1)}` }));
});

test('an oversized title can be removed without blocking future sync', async () => {
  const key = generateSyncKey();
  const task = createTask('x'.repeat(501));
  await assert.rejects(encryptTasks(key, [task]), /Shorten task titles/);
  assert.deepEqual(await decryptTasks(key, await encryptTasks(key, [{ ...task, deletedAt: 1 }])), []);
});

const settings = { workMinutes: 30, breakMinutes: 5, longBreakMinutes: 20, dailyGoal: 6, updatedAt: 1000 };

test('a document carries tasks, each device\'s stats and the shared settings', async () => {
  const key = generateSyncKey();
  const phone = generateDeviceId();
  const document: SyncDocument = {
    tasks: [createTask('Shared task')],
    stats: { [phone]: { '2026-10-22': { sessions: 2, minutes: 50 } } },
    settings,
  };
  assert.ok(isDeviceId(phone));
  const ciphertext = await encryptDocument(key, document);
  assert.ok(!JSON.stringify(ciphertext).includes('2026-10-22'));
  assert.deepEqual(await decryptDocument(key, ciphertext), document);
  assert.deepEqual(await decryptTasks(key, ciphertext), document.tasks);
});

test('malformed stats entries and settings are dropped, not trusted', async () => {
  const key = generateSyncKey();
  const phone = generateDeviceId();
  const ciphertext = await encryptDocument(key, {
    tasks: [],
    stats: { [phone]: { '2026-10-22': { sessions: 1, minutes: 25 } }, 'not-a-device': { '2026-10-22': { sessions: 9, minutes: 9 } } },
    settings: { ...settings, workMinutes: 500 },
  });
  const document = await decryptDocument(key, ciphertext);
  assert.deepEqual(Object.keys(document.stats), [phone]);
  assert.equal(document.settings, null);
});

test('rooms written before stats sync, holding only a task array, still read', async () => {
  // The same encryption the earlier task-only format used
  const key = generateSyncKey();
  const tasks = [createTask('Old room task')];
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`pomoflow:encryption:v2:${key}`));
  const cryptoKey = await crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode('pomoflow:tasks:v2') }, cryptoKey, encoder.encode(JSON.stringify(tasks)));
  const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
  const legacy = { version: 2, iv: base64(iv), data: base64(new Uint8Array(data)) };
  assert.deepEqual(await decryptDocument(key, legacy), { tasks, stats: {}, settings: null });
  assert.deepEqual(await decryptDocument(key, null), { tasks: [], stats: {}, settings: null });
});

test('a device publishes its own stats and newer settings, and leaves other entries alone', () => {
  const laptop = generateDeviceId();
  const phone = generateDeviceId();
  const remote: SyncDocument = {
    tasks: [],
    stats: { [laptop]: { '2026-10-21': { sessions: 1, minutes: 25 } }, [phone]: { '2026-10-20': { sessions: 1, minutes: 25 } } },
    settings,
  };
  const own = { '2026-10-20': { sessions: 1, minutes: 25 }, '2026-10-22': { sessions: 3, minutes: 75 } };

  assert.equal(documentChanged(remote, phone, remote.stats[phone]!, null), false);
  assert.equal(documentChanged(remote, phone, {}, null), false);
  assert.equal(documentChanged(remote, phone, own, null), true);
  assert.equal(documentChanged(remote, phone, remote.stats[phone]!, { ...settings, updatedAt: 999 }), false);
  assert.equal(documentChanged(remote, phone, remote.stats[phone]!, { ...settings, dailyGoal: 9, updatedAt: 1001 }), true);

  const published = publishDocument(remote, [], phone, own, { ...settings, dailyGoal: 9, updatedAt: 1001 });
  assert.deepEqual(published.stats, { [laptop]: remote.stats[laptop], [phone]: own });
  assert.equal(published.settings!.dailyGoal, 9);
  assert.equal(publishDocument(remote, [], phone, own, { ...settings, dailyGoal: 9, updatedAt: 999 }).settings, settings);
  assert.deepEqual(Object.keys(publishDocument(remote, [], generateDeviceId(), {}, null).stats), [laptop, phone]);
});
