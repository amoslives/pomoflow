/**
 * Pure statistics and weekly productivity utilities
 */

export interface DayProductivity {
  day: string; // e.g. "Mon", "Tue"
  date: string; // e.g. "2026-10-15"
  count: number;
  minutes: number;
}

export interface WeeklySummary {
  totalPomodoros: number;
  totalMinutes: number;
  dailyAverage: number;
  bestDay: string;
}

/**
 * Format a Date object to YYYY-MM-DD in local time
 */
export function formatDateKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Records a completed Pomodoro for the given date (defaults to today)
 */
export function recordPomodoroCompletion(
  stats: Record<string, number>,
  date: Date = new Date()
): Record<string, number> {
  const key = formatDateKey(date);
  const current = stats[key] || 0;
  return {
    ...stats,
    [key]: current + 1,
  };
}

/**
 * Generates data for the past 7 days up to referenceDate (inclusive)
 */
export function getPast7DaysData(
  stats: Record<string, number>,
  workMinutes: number = 25,
  referenceDate: Date = new Date()
): DayProductivity[] {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const result: DayProductivity[] = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(referenceDate);
    d.setDate(d.getDate() - i);
    const key = formatDateKey(d);
    const dayLabel = dayNames[d.getDay()];
    const count = stats[key] || 0;

    result.push({
      day: dayLabel,
      date: key,
      count,
      minutes: count * workMinutes,
    });
  }

  return result;
}

/**
 * Calculates weekly focus summary stats
 */
export function calculateWeeklySummary(
  data: DayProductivity[]
): WeeklySummary {
  let totalPomodoros = 0;
  let totalMinutes = 0;
  let maxCount = -1;
  let bestDay = 'None';

  for (const item of data) {
    totalPomodoros += item.count;
    totalMinutes += item.minutes;
    if (item.count > maxCount && item.count > 0) {
      maxCount = item.count;
      bestDay = `${item.day} (${item.count})`;
    }
  }

  const dailyAverage = data.length > 0 ? parseFloat((totalPomodoros / data.length).toFixed(1)) : 0;

  return {
    totalPomodoros,
    totalMinutes,
    dailyAverage,
    bestDay,
  };
}

/**
 * Generates realistic seed data for new users to immediately visualize their weekly chart
 */
export function getSampleWeeklyStats(referenceDate: Date = new Date()): Record<string, number> {
  const sampleCounts = [3, 5, 4, 6, 2, 5, 4];
  const stats: Record<string, number> = {};

  for (let i = 6; i >= 0; i--) {
    const d = new Date(referenceDate);
    d.setDate(d.getDate() - i);
    const key = formatDateKey(d);
    stats[key] = sampleCounts[6 - i];
  }

  return stats;
}
