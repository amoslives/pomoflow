import { Play, Pause, RotateCcw } from 'lucide-react';
import { formatTime, calculateProgress, getStrokeDashoffset } from '../utils/timer';

interface TimerCircleProps {
  mode: 'work' | 'break';
  timeLeft: number;
  totalDuration: number;
  isRunning: boolean;
  workMinutes: number;
  breakMinutes: number;
  onToggleStart: () => void;
  onReset: () => void;
  onChangeWorkMinutes: (val: number) => void;
  onChangeBreakMinutes: (val: number) => void;
}

export function TimerCircle({
  mode,
  timeLeft,
  totalDuration,
  isRunning,
  workMinutes,
  breakMinutes,
  onToggleStart,
  onReset,
  onChangeWorkMinutes,
  onChangeBreakMinutes,
}: TimerCircleProps) {
  const progress = calculateProgress(timeLeft, totalDuration);
  const radius = 130;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = getStrokeDashoffset(progress, circumference);

  return (
    <section className="flex flex-col items-center w-full my-4">
      {/* Circle Progress Display */}
      <div className="relative w-64 h-64 sm:w-72 sm:h-72 flex items-center justify-center select-none">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 300 300">
          {/* Background Track Circle */}
          <circle
            cx="150"
            cy="150"
            r={radius}
            className="stroke-neutral-300 dark:stroke-neutral-800"
            strokeWidth="8"
            fill="transparent"
          />
          {/* Active Progress Circle */}
          <circle
            cx="150"
            cy="150"
            r={radius}
            className="stroke-neutral-600 dark:stroke-neutral-400 transition-all duration-300 ease-linear"
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="butt"
            fill="transparent"
          />
        </svg>

        {/* Center Content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-pixel text-6xl sm:text-7xl font-bold tracking-wider text-neutral-900 dark:text-neutral-100 tabular-nums">
            {formatTime(timeLeft)}
          </span>
          <div className="mt-2 px-3 py-0.5 border border-neutral-400 dark:border-neutral-600 bg-neutral-200 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-300 font-pixel text-lg sm:text-xl uppercase tracking-wider">
            {mode === 'work' ? 'Work' : 'Break'}
          </div>
        </div>
      </div>

      {/* Main Buttons */}
      <div className="flex items-center justify-center gap-3 mt-4 sm:mt-6 w-full max-w-xs">
        <button
          type="button"
          onClick={onToggleStart}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-5 font-pixel text-xl sm:text-2xl uppercase tracking-wider cursor-pointer border transition-all active:translate-y-0.5 shadow-[2px_2px_0px_rgba(0,0,0,0.3)] dark:shadow-[2px_2px_0px_rgba(255,255,255,0.15)] ${
            isRunning
              ? 'bg-neutral-800 text-neutral-100 dark:bg-neutral-200 dark:text-neutral-900 border-neutral-900 dark:border-neutral-100'
              : 'bg-neutral-800 text-neutral-100 dark:bg-neutral-200 dark:text-neutral-900 border-neutral-900 dark:border-neutral-100 hover:bg-neutral-700 dark:hover:bg-neutral-300'
          }`}
        >
          {isRunning ? (
            <>
              <Pause className="w-5 h-5 fill-current" />
              <span>Pause</span>
            </>
          ) : (
            <>
              <Play className="w-5 h-5 fill-current" />
              <span>Start</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onReset}
          className="flex-1 flex items-center justify-center gap-2 py-2 px-5 font-pixel text-xl sm:text-2xl uppercase tracking-wider cursor-pointer border border-neutral-700 dark:border-neutral-400 bg-transparent text-neutral-800 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-800 active:translate-y-0.5 transition-all shadow-[2px_2px_0px_rgba(0,0,0,0.2)] dark:shadow-[2px_2px_0px_rgba(255,255,255,0.1)]"
        >
          <RotateCcw className="w-5 h-5" />
          <span>Reset</span>
        </button>
      </div>

      {/* Interval Sliders */}
      <div className="w-full max-w-sm sm:max-w-md mt-4 sm:mt-5 space-y-3 font-pixel text-lg sm:text-xl text-neutral-800 dark:text-neutral-300">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span>Work: {workMinutes} min</span>
            {isRunning && (
              <span className="text-xs sm:text-sm lowercase italic opacity-60">
                (pause to change)
              </span>
            )}
          </div>
          <input
            type="range"
            min="1"
            max="90"
            value={workMinutes}
            disabled={isRunning}
            onChange={(e) => onChangeWorkMinutes(Number(e.target.value))}
            className="retro-slider w-full disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Work duration slider in minutes"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span>Break: {breakMinutes} min</span>
            {isRunning && (
              <span className="text-xs sm:text-sm lowercase italic opacity-60">
                (pause to change)
              </span>
            )}
          </div>
          <input
            type="range"
            min="1"
            max="45"
            value={breakMinutes}
            disabled={isRunning}
            onChange={(e) => onChangeBreakMinutes(Number(e.target.value))}
            className="retro-slider w-full disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Break duration slider in minutes"
          />
        </div>
      </div>
    </section>
  );
}
