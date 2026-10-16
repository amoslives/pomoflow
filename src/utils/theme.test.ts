import test from 'node:test';
import assert from 'node:assert/strict';
import { nextThemeMode, normalizeThemeMode } from './theme.ts';

test('normalizeThemeMode preserves valid values and defaults to system', () => {
  assert.equal(normalizeThemeMode('system'), 'system');
  assert.equal(normalizeThemeMode('light'), 'light');
  assert.equal(normalizeThemeMode('dark'), 'dark');
  assert.equal(normalizeThemeMode('invalid'), 'system');
  assert.equal(normalizeThemeMode(null), 'system');
});

test('nextThemeMode cycles system, light, and dark', () => {
  assert.equal(nextThemeMode('system'), 'light');
  assert.equal(nextThemeMode('light'), 'dark');
  assert.equal(nextThemeMode('dark'), 'system');
});
