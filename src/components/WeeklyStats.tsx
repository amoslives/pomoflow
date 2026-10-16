import React from 'react';
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
import {
  Flame,
  Clock,
  TrendingUp,
  Award,
  RotateCcw,
  Sparkles,
  Plus
} from 'lucide-react';
import {
  DayProductivity,
  calculateWeeklySummary,
  getPast7DaysData,
  getSampleWeeklyStats,
} from '../utils/stats';

interface WeeklyStatsProps {
  stats: Record<string, number>;
  workMinutes: number;
  isDark: boolean;
  onUpdateStats: (newStats: Record<string, number>) => void;
}

// Custom retro tooltip
function RetroTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const data: DayProductivity = payload[0].payload;
    const hours = (data.minutes / 60).toFixed(1);
    return (
      <div className="p-2.5 bg-neutral-900 text-neutral-100 dark:bg-neutral-100 dark:text-neutral-900 border-2 border-neutral-700 dark:border-neutral-300 font-pixel shadow-[3px_3px_0px_rgba(0,0,0,0.3)]">
        <p className="font-bold text-lg uppercase tracking-wider">{data.day} &bull; {data.date}</p>
        <p className="text-sm">Completed: {data.count} Pomodoro{data.count === 1 ? '' : 's'}</p>
        <p className="text-sm">Focus Time: {data.minutes} mins ({hours} hrs)</p>
      </div>
    );
  }
  return null;
}

export function WeeklyStats({
  stats,
  workMinutes,
  isDark,
  onUpdateStats,
}: WeeklyStatsProps) {
  const past7Days = getPast7DaysData(stats, workMinutes);
  const summary = calculateWeeklySummary(past7Days);

  const totalHours = (summary.totalMinutes / 60).toFixed(1);

  const handleLoadSample = () => {
    onUpdateStats(getSampleWeeklyStats());
  };

  const handleClear = () => {
    onUpdateStats({});
  };

  const handleAddSessionToday = () => {
    const today = new Date().toISOString().split('T')[0];
    onUpdateStats({
      ...stats,
      [today]: (stats[today] || 0) + 1,
    });
  };

  const barColor = isDark ? '#e5e5e5' : '#262626';
  const barHoverColor = isDark ? '#ffffff' : '#404040';
  const gridColor = isDark ? '#374151' : '#d1d5db';
  const axisColor = isDark ? '#9ca3af' : '#6b7280';

  return (
    <section className="w-full flex flex-col font-pixel select-none animate-in fade-in duration-200">
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-4 border-b border-neutral-300 dark:border-neutral-700">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold uppercase tracking-wider text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            <span>Weekly Focus Productivity</span>
          </h2>
          <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 uppercase tracking-wide">
            Completed Pomodoros across the past 7 days
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAddSessionToday}
            className="px-2.5 py-1 text-xs uppercase font-mono-tech border border-neutral-400 dark:border-neutral-600 bg-white/70 dark:bg-neutral-800/70 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 cursor-pointer shadow-[1px_1px_0px_rgba(0,0,0,0.15)] flex items-center gap-1"
            title="Add a completed session for today"
          >
            <Plus className="w-3 h-3" />
            <span>Log +1</span>
          </button>
          <button
            type="button"
            onClick={handleLoadSample}
            className="px-2.5 py-1 text-xs uppercase font-mono-tech border border-neutral-400 dark:border-neutral-600 bg-white/70 dark:bg-neutral-800/70 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 cursor-pointer shadow-[1px_1px_0px_rgba(0,0,0,0.15)] flex items-center gap-1"
            title="Load sample week data"
          >
            <Sparkles className="w-3 h-3 text-amber-500" />
            <span>Demo Data</span>
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="px-2 py-1 text-xs uppercase font-mono-tech border border-neutral-400 dark:border-neutral-600 text-neutral-500 hover:text-red-600 hover:border-red-400 cursor-pointer"
            title="Reset stats"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Metric Cards Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5">
        <div className="p-2.5 border-2 border-neutral-400 dark:border-neutral-700 bg-white/60 dark:bg-neutral-900/60 shadow-[2px_2px_0px_rgba(0,0,0,0.1)]">
          <div className="flex items-center gap-1.5 text-xs uppercase text-neutral-500 dark:text-neutral-400 mb-0.5">
            <Flame className="w-3.5 h-3.5 text-orange-500" />
            <span>Completed</span>
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-neutral-100 tabular-nums">
            {summary.totalPomodoros}
          </div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400 font-mono-tech">
            sessions this week
          </div>
        </div>

        <div className="p-2.5 border-2 border-neutral-400 dark:border-neutral-700 bg-white/60 dark:bg-neutral-900/60 shadow-[2px_2px_0px_rgba(0,0,0,0.1)]">
          <div className="flex items-center gap-1.5 text-xs uppercase text-neutral-500 dark:text-neutral-400 mb-0.5">
            <Clock className="w-3.5 h-3.5 text-blue-500" />
            <span>Focus Time</span>
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-neutral-100 tabular-nums">
            {totalHours} <span className="text-lg">hrs</span>
          </div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400 font-mono-tech">
            {summary.totalMinutes} total mins
          </div>
        </div>

        <div className="p-2.5 border-2 border-neutral-400 dark:border-neutral-700 bg-white/60 dark:bg-neutral-900/60 shadow-[2px_2px_0px_rgba(0,0,0,0.1)]">
          <div className="flex items-center gap-1.5 text-xs uppercase text-neutral-500 dark:text-neutral-400 mb-0.5">
            <TrendingUp className="w-3.5 h-3.5 text-green-500" />
            <span>Daily Average</span>
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-neutral-100 tabular-nums">
            {summary.dailyAverage}
          </div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400 font-mono-tech">
            per day
          </div>
        </div>

        <div className="p-2.5 border-2 border-neutral-400 dark:border-neutral-700 bg-white/60 dark:bg-neutral-900/60 shadow-[2px_2px_0px_rgba(0,0,0,0.1)]">
          <div className="flex items-center gap-1.5 text-xs uppercase text-neutral-500 dark:text-neutral-400 mb-0.5">
            <Award className="w-3.5 h-3.5 text-yellow-500" />
            <span>Peak Day</span>
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-neutral-100 truncate">
            {summary.bestDay}
          </div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400 font-mono-tech">
            highest focus
          </div>
        </div>
      </div>

      {/* Recharts Bar Chart */}
      <div className="w-full p-4 border-2 border-neutral-400 dark:border-neutral-700 bg-white/80 dark:bg-neutral-900/80 shadow-[4px_4px_0px_rgba(0,0,0,0.15)]">
        <div className="text-sm uppercase tracking-wider text-neutral-600 dark:text-neutral-400 mb-3 font-bold flex items-center justify-between">
          <span>Daily Completed Pomodoros</span>
          <span className="font-mono-tech text-xs opacity-75">Work Session = {workMinutes}m</span>
        </div>

        <div className="w-full h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={past7Days}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis
                dataKey="day"
                stroke={axisColor}
                tick={{ fontFamily: 'VT323, monospace', fontSize: 16 }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                stroke={axisColor}
                tick={{ fontFamily: 'VT323, monospace', fontSize: 16 }}
                tickLine={false}
              />
              <Tooltip content={<RetroTooltip />} cursor={{ fill: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }} />
              <Bar dataKey="count" fill={barColor} radius={[0, 0, 0, 0]}>
                {past7Days.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.count > 0 ? barColor : (isDark ? '#2e2e2e' : '#e5e7eb')}
                    className="transition-colors hover:opacity-80"
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Breakdown footnote */}
      <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs sm:text-sm font-mono-tech text-neutral-500 dark:text-neutral-400">
        <span>* Completing a Pomodoro automatically records to your daily stats.</span>
        <span>Local &amp; Cloudflare Synced</span>
      </div>
    </section>
  );
}
