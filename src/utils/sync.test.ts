import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidSyncKey, generateSyncKey, mergeTasks } from './sync.ts';
import { createTask, type Task } from './tasks.ts';

test('isValidSyncKey accepts valid keys and rejects invalid', () => {
  assert.equal(isValidSyncKey('focus-1234'), true);
  assert.equal(isValidSyncKey('my_secret_key_99'), true);
  assert.equal(isValidSyncKey('ab'), false); // too short
  assert.equal(isValidSyncKey(''), false);
  assert.equal(isValidSyncKey('has space in key'), false);
  assert.equal(isValidSyncKey('invalid@key!'), false);
});

test('generateSyncKey returns a formatted valid key', () => {
  const key = generateSyncKey();
  assert.ok(isValidSyncKey(key));
  assert.match(key, /^[a-z]+-\d{4}$/);
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
