import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDateKey,
  recordPomodoroCompletion,
  getPast7DaysData,
  calculateWeeklySummary,
} from './stats.ts';

test('formatDateKey formats date to YYYY-MM-DD', () => {
  const d = new Date(2026, 9, 15); // Month is 0-indexed: 9 = October
  assert.equal(formatDateKey(d), '2026-10-15');
});

test('recordPomodoroCompletion increments count for day', () => {
  const d = new Date(2026, 9, 15);
  const initial = {};
  const updated = recordPomodoroCompletion(initial, d);
  assert.equal(updated['2026-10-15'], 1);

  const second = recordPomodoroCompletion(updated, d);
  assert.equal(second['2026-10-15'], 2);
});

test('getPast7DaysData returns exactly 7 days of data', () => {
  const d = new Date(2026, 9, 15);
  const stats = {
    '2026-10-15': 4,
    '2026-10-14': 2,
  };
  const data = getPast7DaysData(stats, 25, d);
  assert.equal(data.length, 7);
  // Last item is today
  assert.equal(data[6].date, '2026-10-15');
  assert.equal(data[6].count, 4);
  assert.equal(data[6].minutes, 100);
  // Previous day
  assert.equal(data[5].date, '2026-10-14');
  assert.equal(data[5].count, 2);
  assert.equal(data[5].minutes, 50);
});

test('calculateWeeklySummary calculates correct totals and best day', () => {
  const mockData = [
    { day: 'Sun', date: '2026-10-11', count: 2, minutes: 50 },
    { day: 'Mon', date: '2026-10-12', count: 4, minutes: 100 },
    { day: 'Tue', date: '2026-10-13', count: 6, minutes: 150 }, // Best day
    { day: 'Wed', date: '2026-10-14', count: 1, minutes: 25 },
    { day: 'Thu', date: '2026-10-15', count: 3, minutes: 75 },
    { day: 'Fri', date: '2026-10-16', count: 0, minutes: 0 },
    { day: 'Sat', date: '2026-10-17', count: 0, minutes: 0 },
  ];

  const summary = calculateWeeklySummary(mockData);
  assert.equal(summary.totalPomodoros, 16);
  assert.equal(summary.totalMinutes, 400);
  assert.equal(summary.dailyAverage, 2.3);
  assert.equal(summary.bestDay, 'Tue (6)');
});
