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
import { Play } from 'lucide-react';
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

function DialogTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const data: DayProductivity = payload[0].payload;
  return (
    <div className="dialog px-3 py-2 font-pixel">
      <p className="font-bold text-lg">{data.day} {data.date}</p>
      <p className="font-data text-lg">{formatMinutes(data.minutes)} focused</p>
      <p className="font-data text-lg">{data.sessions} {data.sessions === 1 ? 'timer' : 'timers'} completed</p>
    </div>
  );
}

export function WeeklyStats({ stats, isDark, onGoToTimer }: WeeklyStatsProps) {
  const past7Days = getPast7DaysData(stats);
  const summary = calculateWeeklySummary(past7Days);
  const hasHistory = summary.totalSessions > 0;
  const ink = isDark ? '#ececec' : '#000000';
  const paper = isDark ? '#121212' : '#ffffff';

  return (
    <section className="w-full flex flex-col select-none">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-2xl font-bold">Last 7 days</h2>
        <p className="dim text-base text-right">Only work timers that reached 00:00 count.</p>
      </div>

      {/* Get Info style summary */}
      <dl className="grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_auto_1fr] gap-x-4 gap-y-1 text-lg border-2 border-[var(--ink)] p-3 mb-4">
        <dt className="font-bold">Timers</dt>
        <dd className="font-data text-xl">{summary.totalSessions}</dd>
        <dt className="font-bold">Focus time</dt>
        <dd className="font-data text-xl">{formatMinutes(summary.totalMinutes)}</dd>
        <dt className="font-bold">Daily average</dt>
        <dd className="font-data text-xl">{formatMinutes(summary.dailyAverageMinutes)}</dd>
        <dt className="font-bold">Best day</dt>
        <dd className="font-data text-xl">
          {summary.bestDayMinutes ? `${summary.bestDay}, ${formatMinutes(summary.bestDayMinutes)}` : 'none yet'}
        </dd>
      </dl>

      {hasHistory ? (
        <div className="w-full border-2 border-[var(--ink)] p-3">
          <div className="text-lg font-bold mb-2">Minutes per day</div>
          <div className="w-full h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={past7Days} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barCategoryGap="28%">
                <defs>
                  <pattern id="dither" width="4" height="4" patternUnits="userSpaceOnUse">
                    <rect width="4" height="4" fill={paper} />
                    <rect width="2" height="2" fill={ink} />
                    <rect x="2" y="2" width="2" height="2" fill={ink} />
                  </pattern>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke={ink} vertical={false} />
                <XAxis dataKey="day" stroke={ink} tick={{ fontFamily: 'Pixelify Sans, monospace', fontSize: 16, fill: ink }} tickLine={false} axisLine={{ strokeWidth: 2 }} />
                <YAxis allowDecimals={false} stroke={ink} tick={{ fontFamily: 'VT323, monospace', fontSize: 18, fill: ink }} tickLine={false} axisLine={{ strokeWidth: 2 }} />
                <Tooltip content={<DialogTooltip />} cursor={{ fill: 'transparent', stroke: ink, strokeDasharray: '2 2' }} />
                <Bar dataKey="minutes" fill={ink} stroke={ink} strokeWidth={2} isAnimationActive={false}>
                  {past7Days.map((entry) => (
                    <Cell key={entry.date} fill={entry.minutes > 0 ? ink : 'url(#dither)'} />
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

      <p className="mt-3 text-base dim">Stats are stored on this device only.</p>
    </section>
  );
}
