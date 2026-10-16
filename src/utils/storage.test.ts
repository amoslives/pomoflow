import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStoredInteger, parseStoredJson } from './storage.ts';

test('parseStoredInteger validates and clamps persisted settings', () => {
  assert.equal(parseStoredInteger('30', 25, 1, 90), 30);
  assert.equal(parseStoredInteger('garbage', 25, 1, 90), 25);
  assert.equal(parseStoredInteger('12px', 25, 1, 90), 25);
  assert.equal(parseStoredInteger('999', 25, 1, 90), 90);
  assert.equal(parseStoredInteger('-1', 25, 1, 90), 1);
});

test('parseStoredJson returns null for malformed values', () => {
  assert.deepEqual(parseStoredJson('{"ok":true}'), { ok: true });
  assert.equal(parseStoredJson('{broken'), null);
  assert.equal(parseStoredJson(null), null);
});
