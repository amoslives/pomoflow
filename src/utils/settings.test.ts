import test from 'node:test';
import assert from 'node:assert/strict';
import { newerSettings, normalizeSettings } from './settings.ts';

const settings = { workMinutes: 25, breakMinutes: 5, longBreakMinutes: 15, dailyGoal: 8, updatedAt: 1000 };

test('normalizeSettings accepts settings within their limits only', () => {
  assert.deepEqual(normalizeSettings({ ...settings, extra: true }), settings);
  assert.equal(normalizeSettings({ ...settings, longBreakMinutes: 4 }), null);
  assert.equal(normalizeSettings({ ...settings, dailyGoal: 25 }), null);
  assert.equal(normalizeSettings({ ...settings, workMinutes: 2.5 }), null);
  assert.equal(normalizeSettings({ ...settings, updatedAt: 0 }), null);
  assert.equal(normalizeSettings(null), null);
  assert.equal(normalizeSettings([settings]), null);
});

test('newerSettings keeps the most recent change, and the remote copy on a tie', () => {
  const later = { ...settings, dailyGoal: 6, updatedAt: 2000 };
  assert.equal(newerSettings(later, settings), later);
  assert.equal(newerSettings(settings, later), later);
  const tie = { ...settings, dailyGoal: 4 };
  assert.equal(newerSettings(tie, settings), settings);
  assert.equal(newerSettings(null, settings), settings);
  assert.equal(newerSettings(settings, null), settings);
});
