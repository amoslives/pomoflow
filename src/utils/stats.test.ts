import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDateKey,
  recordFocusSession,
  getPast7DaysData,
  calculateWeeklySummary,
  migrateLegacyStats,
  normalizeFocusStats,
} from './stats.ts';

test('formatDateKey formats date in local time', () => {
  assert.equal(formatDateKey(new Date(2026, 9, 15)), '2026-10-15');
});

test('recordFocusSession records each completed timer with its actual duration', () => {
  const date = new Date(2026, 9, 15);
  const first = recordFocusSession({}, 30, date);
  const second = recordFocusSession(first, 45, date);
  assert.deepEqual(second['2026-10-15'], { sessions: 2, minutes: 75 });
});

test('getPast7DaysData returns actual recorded minutes and sessions', () => {
  const data = getPast7DaysData({
    '2026-10-15': { sessions: 2, minutes: 55 },
    '2026-10-14': { sessions: 1, minutes: 40 },
  }, new Date(2026, 9, 15));
  assert.equal(data.length, 7);
  assert.deepEqual(data[6], { day: 'Thu', date: '2026-10-15', sessions: 2, minutes: 55 });
  assert.equal(data[5].minutes, 40);
});

test('calculateWeeklySummary uses minutes for averages and peak day', () => {
  const summary = calculateWeeklySummary([
    { day: 'Sun', date: '2026-10-11', sessions: 2, minutes: 50 },
    { day: 'Mon', date: '2026-10-12', sessions: 4, minutes: 80 },
    { day: 'Tue', date: '2026-10-13', sessions: 1, minutes: 90 },
    ...['Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => ({ day, date: `2026-10-${14 + i}`, sessions: 0, minutes: 0 })),
  ]);
  assert.deepEqual(summary, {
    totalSessions: 7,
    totalMinutes: 220,
    dailyAverageMinutes: 31,
    activeDays: 3,
    bestDay: 'Tue',
    bestDayMinutes: 90,
  });
});

test('migrateLegacyStats discards generated demo data', () => {
  const legacy = Object.fromEntries([3, 5, 4, 6, 2, 5, 4].map((count, i) => [`2026-10-${10 + i}`, count]));
  assert.deepEqual(migrateLegacyStats(legacy, 25), {});
});

test('migrateLegacyStats preserves real counts using the saved duration', () => {
  assert.deepEqual(migrateLegacyStats({ '2026-10-15': 2 }, 30), {
    '2026-10-15': { sessions: 2, minutes: 60 },
  });
});

test('normalizeFocusStats drops malformed records', () => {
  assert.deepEqual(normalizeFocusStats({
    '2026-10-15': { sessions: 2, minutes: 60 },
    bad: { sessions: 1, minutes: 25 },
    '2026-10-16': { sessions: 'many', minutes: 25 },
  }), { '2026-10-15': { sessions: 2, minutes: 60 } });
});
