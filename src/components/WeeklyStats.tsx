import { useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts';
import { Download, Minus, Play, Plus } from 'lucide-react';
import {
  type FocusStats,
  calculateStreak,
  focusStatsToCsv,
  formatDateKey,
  getPastDaysData,
  getPastMonthsData,
  summarizePeriod,
} from '../utils/stats';
import { SETTING_LIMITS } from '../utils/settings';

interface WeeklyStatsProps {
  // This device's stats, plus its paired devices' when synced
  stats: FocusStats;
  isDark: boolean;
  onGoToTimer: () => void;
  goal: number;
  onChangeGoal: (goal: number) => void;
  synced: boolean;
}

type Period = 'week' | 'month' | 'year';
const PERIODS: { id: Period; label: string; heading: string }[] = [
  { id: 'week', label: 'Week', heading: 'Last 7 days' },
  { id: 'month', label: 'Month', heading: 'Last 30 days' },
  { id: 'year', label: 'Year', heading: 'Last 12 months' },
];

const [GOAL_MIN, GOAL_MAX] = SETTING_LIMITS.dailyGoal;

// One bar: `label` is the axis label, `name` names it in the summary, `title` heads its tooltip
interface ChartRow {
  key: string;
  label: string;
  name: string;
  title: string;
  sessions: number;
  minutes: number;
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function chartRows(stats: FocusStats, period: Period, now: Date): ChartRow[] {
  if (period === 'year') {
    return getPastMonthsData(stats, 12, now).map((month) => ({
      key: month.month, label: month.name, name: `${month.name} ${month.year}`, title: `${month.name} ${month.year}`,
      sessions: month.sessions, minutes: month.minutes,
    }));
  }
  return getPastDaysData(stats, period === 'week' ? 7 : 30, now).map((day) => {
    const monthName = new Date(`${day.date}T12:00:00`).toLocaleString('en', { month: 'short' });
    const dayOfMonth = String(Number(day.date.slice(8)));
    return {
      key: day.date, label: period === 'week' ? day.day : dayOfMonth,
      name: period === 'week' ? day.day : `${monthName} ${dayOfMonth}`, title: `${day.day} ${day.date}`,
      sessions: day.sessions, minutes: day.minutes,
    };
  });
}

function DialogTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const data: ChartRow = payload[0].payload;
  return (
    <div className="dialog px-3 py-2 font-pixel">
      <p className="font-bold text-lg">{data.title}</p>
      <p className="font-data text-lg">{formatMinutes(data.minutes)} focused</p>
      <p className="font-data text-lg">{data.sessions} {data.sessions === 1 ? 'timer' : 'timers'} completed</p>
    </div>
  );
}

export function WeeklyStats({ stats, isDark, onGoToTimer, goal, onChangeGoal, synced }: WeeklyStatsProps) {
  const [period, setPeriod] = useState<Period>('week');

  const now = new Date();
  const today = stats[formatDateKey(now)]?.sessions ?? 0;
  const streak = calculateStreak(stats, now);
  const hasHistory = Object.values(stats).some((day) => day.sessions > 0);
  const rows = chartRows(stats, period, now);
  const summary = summarizePeriod(rows);
  const unit = period === 'year' ? 'month' : 'day';
  const heading = PERIODS.find((entry) => entry.id === period)!.heading;
  const ink = isDark ? '#ececec' : '#000000';
  const paper = isDark ? '#121212' : '#ffffff';

  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([focusStatsToCsv(stats)], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `pomoflow-stats-${formatDateKey(now)}.csv`;
    link.click();
    // Some browsers read the file after click() returns
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <section className="w-full flex flex-col select-none">
      <section className="groupbox mb-5" aria-labelledby="today-label">
        <h2 id="today-label" className="groupbox-label">Today</h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="font-data text-xl whitespace-nowrap">{today} of {goal} {goal === 1 ? 'timer' : 'timers'}</p>
          <div
            className="progress flex-1 min-w-32"
            role="progressbar"
            aria-label="Daily goal"
            aria-valuemin={0}
            aria-valuemax={goal}
            aria-valuenow={Math.min(today, goal)}
          >
            <div className="progress-fill" style={{ width: `${Math.min(100, (today / goal) * 100)}%` }} />
          </div>
          <div className="flex items-center gap-2 text-lg">
            <span>Goal</span>
            <button type="button" onClick={() => onChangeGoal(goal - 1)} disabled={goal <= GOAL_MIN} aria-label="Lower daily goal" className="btn btn-sm btn-icon">
              <Minus strokeWidth={3} />
            </button>
            <span className="font-data text-xl w-6 text-center" aria-live="polite">{goal}</span>
            <button type="button" onClick={() => onChangeGoal(goal + 1)} disabled={goal >= GOAL_MAX} aria-label="Raise daily goal" className="btn btn-sm btn-icon">
              <Plus strokeWidth={3} />
            </button>
          </div>
        </div>
        <p className="mt-2 text-lg">
          {today >= goal && <span className="font-bold">Goal met. </span>}
          Streak: <span className="font-data text-xl">{streak} {streak === 1 ? 'day' : 'days'}</span>
        </p>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-1">
        <h2 className="text-2xl font-bold whitespace-nowrap">{heading}</h2>
        <div className="flex gap-1" role="group" aria-label="Period">
          {PERIODS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setPeriod(entry.id)}
              aria-pressed={period === entry.id}
              className="btn btn-sm"
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>
      <p className="dim text-base mb-3">Only work timers that reached 00:00 count.</p>

      {/* Get Info style summary */}
      <dl className="grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_auto_1fr] gap-x-4 gap-y-1 text-lg border-2 border-[var(--ink)] p-3 mb-4">
        <dt className="font-bold">Timers</dt>
        <dd className="font-data text-xl">{summary.totalSessions}</dd>
        <dt className="font-bold">Focus time</dt>
        <dd className="font-data text-xl">{formatMinutes(summary.totalMinutes)}</dd>
        <dt className="font-bold">{unit === 'day' ? 'Daily' : 'Monthly'} average</dt>
        <dd className="font-data text-xl">{formatMinutes(summary.averageMinutes)}</dd>
        <dt className="font-bold">Best {unit}</dt>
        <dd className="font-data text-xl">
          {summary.bestMinutes ? `${summary.best}, ${formatMinutes(summary.bestMinutes)}` : 'none yet'}
        </dd>
      </dl>

      {hasHistory ? (
        <div className="w-full border-2 border-[var(--ink)] p-3">
          <div className="text-lg font-bold mb-2">Minutes per {unit}</div>
          <div className="w-full h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barCategoryGap={period === 'month' ? '20%' : '28%'}>
                <defs>
                  <pattern id="dither" width="4" height="4" patternUnits="userSpaceOnUse">
                    <rect width="4" height="4" fill={paper} />
                    <rect width="2" height="2" fill={ink} />
                    <rect x="2" y="2" width="2" height="2" fill={ink} />
                  </pattern>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke={ink} vertical={false} />
                <XAxis
                  dataKey="label"
                  // Every fifth day for a month; otherwise the chart skips labels that would overlap
                  interval={period === 'month' ? 4 : undefined}
                  stroke={ink}
                  tick={{ fontFamily: 'Pixelify Sans, monospace', fontSize: 16, fill: ink }}
                  tickLine={false}
                  axisLine={{ strokeWidth: 2 }}
                />
                <YAxis allowDecimals={false} stroke={ink} tick={{ fontFamily: 'VT323, monospace', fontSize: 18, fill: ink }} tickLine={false} axisLine={{ strokeWidth: 2 }} />
                <Tooltip content={<DialogTooltip />} cursor={{ fill: 'transparent', stroke: ink, strokeDasharray: '2 2' }} />
                <Bar dataKey="minutes" fill={ink} stroke={ink} strokeWidth={2} isAnimationActive={false}>
                  {rows.map((entry) => (
                    <Cell key={entry.key} fill={entry.minutes > 0 ? ink : 'url(#dither)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="w-full min-h-64 border-2 border-[var(--ink)] p-6 flex flex-col items-center justify-center text-center">
          <h3 className="text-2xl font-bold">No focus sessions yet</h3>
          <p className="max-w-md mt-1 text-lg dim">
            Finish one work timer and it will show up here. Paused, reset or abandoned timers are not counted.
          </p>
          <button type="button" onClick={onGoToTimer} className="btn btn-default mt-5">
            <Play className="w-4 h-4 fill-current" />
            Start a timer
          </button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-base dim">{synced ? 'Stats include your paired devices.' : 'Stats are stored on this device only.'}</p>
        <button type="button" onClick={exportCsv} disabled={!hasHistory} className="btn btn-sm">
          <Download className="w-4 h-4" strokeWidth={2.5} />
          <span>Export CSV</span>
        </button>
      </div>
    </section>
  );
}
