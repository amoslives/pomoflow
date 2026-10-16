export interface FocusDayStats {
  sessions: number;
  minutes: number;
}

export type FocusStats = Record<string, FocusDayStats>;

export interface DayProductivity extends FocusDayStats {
  day: string;
  date: string;
}

export interface WeeklySummary {
  totalSessions: number;
  totalMinutes: number;
  dailyAverageMinutes: number;
  activeDays: number;
  bestDay: string;
  bestDayMinutes: number;
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

export function getPast7DaysData(
  stats: FocusStats,
  referenceDate: Date = new Date()
): DayProductivity[] {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const result: DayProductivity[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(referenceDate);
    d.setDate(d.getDate() - i);
    const date = formatDateKey(d);
    const entry = stats[date] || { sessions: 0, minutes: 0 };
    result.push({ day: dayNames[d.getDay()], date, ...entry });
  }
  return result;
}

export function calculateWeeklySummary(data: DayProductivity[]): WeeklySummary {
  const totalSessions = data.reduce((sum, item) => sum + item.sessions, 0);
  const totalMinutes = data.reduce((sum, item) => sum + item.minutes, 0);
  const activeDays = data.filter((item) => item.minutes > 0).length;
  const peak = data.reduce<DayProductivity | null>(
    (best, item) => !best || item.minutes > best.minutes ? item : best,
    null
  );
  return {
    totalSessions,
    totalMinutes,
    dailyAverageMinutes: data.length ? Math.round(totalMinutes / data.length) : 0,
    activeDays,
    bestDay: peak && peak.minutes > 0 ? peak.day : 'None',
    bestDayMinutes: peak?.minutes || 0,
  };
}
