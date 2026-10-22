export interface FocusDayStats {
  sessions: number;
  minutes: number;
}

export type FocusStats = Record<string, FocusDayStats>;

export interface DayProductivity extends FocusDayStats {
  day: string;
  date: string;
}

export interface PeriodSummary {
  totalSessions: number;
  totalMinutes: number;
  averageMinutes: number;
  best: string;
  bestMinutes: number;
}

export function formatDateKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function normalizeFocusStats(value: unknown): FocusStats {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: FocusStats = {};
  for (const [date, raw] of Object.entries(value)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !raw || typeof raw !== 'object') continue;
    const entry = raw as Partial<FocusDayStats>;
    if (
      typeof entry.sessions !== 'number'
      || !Number.isInteger(entry.sessions)
      || entry.sessions < 0
      || typeof entry.minutes !== 'number'
      || !Number.isFinite(entry.minutes)
      || entry.minutes < 0
    ) continue;
    result[date] = { sessions: entry.sessions, minutes: Math.round(entry.minutes) };
  }
  return result;
}

export function recordFocusSession(
  stats: FocusStats,
  minutes: number,
  date: Date = new Date()
): FocusStats {
  const key = formatDateKey(date);
  const current = stats[key] || { sessions: 0, minutes: 0 };
  return {
    ...stats,
    [key]: {
      sessions: current.sessions + 1,
      minutes: current.minutes + Math.max(1, Math.round(minutes)),
    },
  };
}

export function migrateLegacyStats(value: unknown, workMinutes: number): FocusStats {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const entries = Object.entries(value)
    .filter(([date, count]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isInteger(count) && Number(count) >= 0)
    .sort(([a], [b]) => a.localeCompare(b));

  const demoPattern = [3, 5, 4, 6, 2, 5, 4];
  if (entries.length === demoPattern.length && entries.every(([, count], index) => count === demoPattern[index])) {
    return {};
  }

  return Object.fromEntries(entries.map(([date, count]) => [date, {
    sessions: Number(count),
    minutes: Number(count) * workMinutes,
  }]));
}

export function getPastDaysData(
  stats: FocusStats,
  days: number,
  referenceDate: Date = new Date()
): DayProductivity[] {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const result: DayProductivity[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(referenceDate);
    d.setDate(d.getDate() - i);
    const date = formatDateKey(d);
    const entry = stats[date] || { sessions: 0, minutes: 0 };
    result.push({ day: dayNames[d.getDay()] ?? '', date, ...entry });
  }
  return result;
}

export interface MonthProductivity extends FocusDayStats {
  month: string;
  name: string;
  year: number;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function getPastMonthsData(
  stats: FocusStats,
  months: number,
  referenceDate: Date = new Date()
): MonthProductivity[] {
  const result: MonthProductivity[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - i, 1);
    const month = formatDateKey(d).slice(0, 7);
    result.push({ month, name: MONTH_NAMES[d.getMonth()] ?? '', year: d.getFullYear(), sessions: 0, minutes: 0 });
  }
  const byMonth = new Map(result.map((entry) => [entry.month, entry]));
  for (const [date, day] of Object.entries(stats)) {
    const entry = byMonth.get(date.slice(0, 7));
    if (entry) {
      entry.sessions += day.sessions;
      entry.minutes += day.minutes;
    }
  }
  return result;
}

/**
 * Days in a row with at least one completed timer, ending today. A day without a
 * timer yet does not break the streak until it is over.
 */
export function calculateStreak(stats: FocusStats, referenceDate: Date = new Date()): number {
  const d = new Date(referenceDate);
  if (!stats[formatDateKey(d)]?.sessions) d.setDate(d.getDate() - 1);
  let streak = 0;
  while (stats[formatDateKey(d)]?.sessions) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

export function focusStatsToCsv(stats: FocusStats): string {
  const rows = Object.keys(stats).sort().map((date) => `${date},${stats[date]!.sessions},${stats[date]!.minutes}`);
  return ['date,timers,focus_minutes', ...rows].join('\n') + '\n';
}

/** Totals for a run of days or months. `name` labels each entry, for the best one. */
export function summarizePeriod(data: (FocusDayStats & { name: string })[]): PeriodSummary {
  const totalSessions = data.reduce((sum, item) => sum + item.sessions, 0);
  const totalMinutes = data.reduce((sum, item) => sum + item.minutes, 0);
  const peak = data.reduce<(typeof data)[number] | null>(
    (best, item) => !best || item.minutes > best.minutes ? item : best,
    null
  );
  return {
    totalSessions,
    totalMinutes,
    averageMinutes: data.length ? Math.round(totalMinutes / data.length) : 0,
    best: peak && peak.minutes > 0 ? peak.name : 'None',
    bestMinutes: peak?.minutes || 0,
  };
}
