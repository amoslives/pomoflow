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
import { Award, Clock, Flame, Play, TrendingUp } from 'lucide-react';
import {
  type DayProductivity,
  type FocusStats,
  calculateWeeklySummary,
  getPast7DaysData,
} from '../utils/stats';

interface WeeklyStatsProps {
  stats: FocusStats;
  isDark: boolean;
  onGoToTimer: () => void;
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function RetroTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const data: DayProductivity = payload[0].payload;
  return (
    <div className="p-2.5 bg-neutral-900 text-neutral-100 dark:bg-neutral-100 dark:text-neutral-900 border-2 border-neutral-700 dark:border-neutral-300 font-pixel shadow-[3px_3px_0px_rgba(0,0,0,0.3)]">
      <p className="font-bold text-lg uppercase tracking-wider">{data.day} &bull; {data.date}</p>
      <p className="text-sm">Focus time: {formatMinutes(data.minutes)}</p>
      <p className="text-sm">Completed timers: {data.sessions}</p>
    </div>
  );
}

export function WeeklyStats({ stats, isDark, onGoToTimer }: WeeklyStatsProps) {
  const past7Days = getPast7DaysData(stats);
  const summary = calculateWeeklySummary(past7Days);
  const hasHistory = summary.totalSessions > 0;
  const barColor = isDark ? '#e5e5e5' : '#262626';
  const gridColor = isDark ? '#374151' : '#d1d5db';
  const axisColor = isDark ? '#9ca3af' : '#6b7280';

  return (
    <section className="w-full flex flex-col font-pixel select-none animate-in fade-in duration-200">
      <div className="pb-3 mb-4 border-b border-neutral-300 dark:border-neutral-700">
        <h2 className="text-2xl sm:text-3xl font-bold uppercase tracking-wider text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-orange-600 dark:text-orange-400" />
          <span>Last 7 Days</span>
        </h2>
        <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 uppercase tracking-wide">
          Actual minutes from completed work timers
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5">
        <MetricCard icon={<Flame className="w-3.5 h-3.5 text-orange-500" />} label="Sessions" value={String(summary.totalSessions)} detail="completed timers" />
        <MetricCard icon={<Clock className="w-3.5 h-3.5 text-blue-500" />} label="Focus Time" value={formatMinutes(summary.totalMinutes)} detail="actual minutes" />
        <MetricCard icon={<TrendingUp className="w-3.5 h-3.5 text-green-500" />} label="Daily Average" value={formatMinutes(summary.dailyAverageMinutes)} detail="across 7 days" />
        <MetricCard icon={<Award className="w-3.5 h-3.5 text-yellow-500" />} label="Peak Day" value={summary.bestDay} detail={summary.bestDayMinutes ? formatMinutes(summary.bestDayMinutes) : 'no sessions yet'} />
      </div>

      {hasHistory ? (
        <div className="w-full p-4 border-2 border-neutral-400 dark:border-neutral-700 bg-white/80 dark:bg-neutral-900/80 shadow-[4px_4px_0px_rgba(0,0,0,0.15)]">
          <div className="text-sm uppercase tracking-wider text-neutral-600 dark:text-neutral-400 mb-3 font-bold">
            Daily focus minutes
          </div>
          <div className="w-full h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={past7Days} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="day" stroke={axisColor} tick={{ fontFamily: 'VT323, monospace', fontSize: 16 }} tickLine={false} />
                <YAxis allowDecimals={false} stroke={axisColor} tick={{ fontFamily: 'VT323, monospace', fontSize: 16 }} tickLine={false} />
                <Tooltip content={<RetroTooltip />} cursor={{ fill: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }} />
                <Bar dataKey="minutes" fill={barColor}>
                  {past7Days.map((entry) => (
                    <Cell key={entry.date} fill={entry.minutes > 0 ? barColor : (isDark ? '#2e2e2e' : '#e5e7eb')} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="w-full min-h-64 p-6 border-2 border-neutral-400 dark:border-neutral-700 bg-white/70 dark:bg-neutral-900/70 shadow-[4px_4px_0px_rgba(0,0,0,0.15)] flex flex-col items-center justify-center text-center">
          <Clock className="w-10 h-10 mb-3 text-neutral-400" />
          <h3 className="text-2xl uppercase text-neutral-900 dark:text-neutral-100">No focus sessions yet</h3>
          <p className="max-w-md mt-1 text-base text-neutral-600 dark:text-neutral-400 font-mono-tech">
            Complete a work timer to record one session and its configured minutes. Paused, reset, or abandoned timers are not counted.
          </p>
          <button type="button" onClick={onGoToTimer} className="mt-4 px-4 py-2 bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900 uppercase flex items-center gap-2 cursor-pointer">
            <Play className="w-4 h-4 fill-current" />
            Start a timer
          </button>
        </div>
      )}

      <p className="mt-3 text-xs sm:text-sm font-mono-tech text-neutral-500 dark:text-neutral-400">
        Recorded automatically when a work timer reaches 00:00. Stats are stored on this device.
      </p>
    </section>
  );
}

function MetricCard({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return (
    <div className="p-2.5 border-2 border-neutral-400 dark:border-neutral-700 bg-white/60 dark:bg-neutral-900/60 shadow-[2px_2px_0px_rgba(0,0,0,0.1)]">
      <div className="flex items-center gap-1.5 text-xs uppercase text-neutral-500 dark:text-neutral-400 mb-0.5">{icon}<span>{label}</span></div>
      <div className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-neutral-100 tabular-nums truncate">{value}</div>
      <div className="text-xs text-neutral-500 dark:text-neutral-400 font-mono-tech">{detail}</div>
    </div>
  );
}
