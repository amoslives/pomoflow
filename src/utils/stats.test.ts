import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDateKey,
  recordFocusSession,
  summarizePeriod,
  migrateLegacyStats,
  normalizeFocusStats,
  getPastDaysData,
  getPastMonthsData,
  calculateStreak,
  focusStatsToCsv,
  sumStats,
  sameStats,
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

test('getPastDaysData returns actual recorded minutes and sessions', () => {
  const data = getPastDaysData({
    '2026-10-15': { sessions: 2, minutes: 55 },
    '2026-10-14': { sessions: 1, minutes: 40 },
  }, 7, new Date(2026, 9, 15));
  assert.equal(data.length, 7);
  assert.deepEqual(data[6], { day: 'Thu', date: '2026-10-15', sessions: 2, minutes: 55 });
  assert.equal(data[5]!.minutes, 40);
});

test('summarizePeriod uses minutes for averages and the best entry', () => {
  const summary = summarizePeriod([
    { name: 'Sun', sessions: 2, minutes: 50 },
    { name: 'Mon', sessions: 4, minutes: 80 },
    { name: 'Tue', sessions: 1, minutes: 90 },
    ...['Wed', 'Thu', 'Fri', 'Sat'].map((name) => ({ name, sessions: 0, minutes: 0 })),
  ]);
  assert.deepEqual(summary, {
    totalSessions: 7,
    totalMinutes: 220,
    averageMinutes: 31,
    best: 'Tue',
    bestMinutes: 90,
  });
  assert.equal(summarizePeriod([{ name: 'Jan', sessions: 0, minutes: 0 }]).best, 'None');
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

test('getPastDaysData covers any number of days ending today', () => {
  const data = getPastDaysData({ '2026-09-23': { sessions: 1, minutes: 25 } }, 30, new Date(2026, 9, 22));
  assert.equal(data.length, 30);
  assert.deepEqual(data[0], { day: 'Wed', date: '2026-09-23', sessions: 1, minutes: 25 });
  assert.equal(data[29]!.date, '2026-10-22');
});

test('getPastMonthsData totals each month and crosses the year boundary', () => {
  const data = getPastMonthsData({
    '2025-11-30': { sessions: 1, minutes: 25 },
    '2026-02-01': { sessions: 2, minutes: 50 },
    '2026-02-28': { sessions: 1, minutes: 30 },
    '2025-10-31': { sessions: 9, minutes: 225 },
  }, 4, new Date(2026, 1, 15));
  assert.deepEqual(data.map((month) => [month.month, month.name, month.year, month.sessions, month.minutes]), [
    ['2025-11', 'Nov', 2025, 1, 25],
    ['2025-12', 'Dec', 2025, 0, 0],
    ['2026-01', 'Jan', 2026, 0, 0],
    ['2026-02', 'Feb', 2026, 3, 80],
  ]);
});

test('calculateStreak counts days in a row and keeps an unfinished today open', () => {
  const stats = {
    '2026-10-19': { sessions: 1, minutes: 25 },
    '2026-10-20': { sessions: 2, minutes: 50 },
    '2026-10-21': { sessions: 1, minutes: 25 },
  };
  assert.equal(calculateStreak(stats, new Date(2026, 9, 22)), 3);
  assert.equal(calculateStreak({ ...stats, '2026-10-22': { sessions: 1, minutes: 25 } }, new Date(2026, 9, 22)), 4);
  assert.equal(calculateStreak(stats, new Date(2026, 9, 23)), 0);
  assert.equal(calculateStreak({}, new Date(2026, 9, 22)), 0);
});

test('focusStatsToCsv lists every recorded day in date order', () => {
  assert.equal(focusStatsToCsv({
    '2026-10-21': { sessions: 1, minutes: 25 },
    '2026-10-02': { sessions: 3, minutes: 80 },
  }), 'date,timers,focus_minutes\n2026-10-02,3,80\n2026-10-21,1,25\n');
  assert.equal(focusStatsToCsv({}), 'date,timers,focus_minutes\n');
});

test('sumStats adds devices day by day', () => {
  assert.deepEqual(sumStats(
    { '2026-10-21': { sessions: 1, minutes: 25 }, '2026-10-22': { sessions: 2, minutes: 50 } },
    { '2026-10-22': { sessions: 1, minutes: 30 } },
    {},
  ), { '2026-10-21': { sessions: 1, minutes: 25 }, '2026-10-22': { sessions: 3, minutes: 80 } });
});

test('sameStats compares every day', () => {
  const stats = { '2026-10-22': { sessions: 2, minutes: 50 } };
  assert.equal(sameStats(stats, { '2026-10-22': { sessions: 2, minutes: 50 } }), true);
  assert.equal(sameStats(stats, { '2026-10-22': { sessions: 2, minutes: 55 } }), false);
  assert.equal(sameStats(stats, { ...stats, '2026-10-21': { sessions: 1, minutes: 25 } }), false);
  assert.equal(sameStats(undefined, {}), true);
  assert.equal(sameStats(stats, undefined), false);
});
