import { Play, Pause, RotateCcw, SkipForward, X } from 'lucide-react';
import { formatTime, calculateProgress } from '../utils/timer';
import { SESSIONS_PER_LONG_BREAK } from '../hooks/usePomodoro';

interface TimerCircleProps {
  mode: 'work' | 'break';
  intervalName: string;
  timeLeft: number;
  totalDuration: number;
  isRunning: boolean;
  // Work sessions done toward the next long break; null during the long break itself
  sessionsTowardLongBreak: number | null;
  workMinutes: number;
  breakMinutes: number;
  longBreakMinutes: number;
  onToggleStart: () => void;
  onReset: () => void;
  onStartWork: () => void;
  onChangeWorkMinutes: (val: number) => void;
  onChangeBreakMinutes: (val: number) => void;
  onChangeLongBreakMinutes: (val: number) => void;
  // null when the browser cannot keep the screen awake
  keepAwake: boolean | null;
  onChangeKeepAwake: (keepAwake: boolean) => void;
}

export function TimerCircle({
  mode,
  intervalName,
  timeLeft,
  totalDuration,
  isRunning,
  sessionsTowardLongBreak,
  workMinutes,
  breakMinutes,
  longBreakMinutes,
  onToggleStart,
  onReset,
  onStartWork,
  onChangeWorkMinutes,
  onChangeBreakMinutes,
  onChangeLongBreakMinutes,
  keepAwake,
  onChangeKeepAwake,
}: TimerCircleProps) {
  const elapsedPercent = calculateProgress(timeLeft, totalDuration);
  const sessionsDone = sessionsTowardLongBreak ?? SESSIONS_PER_LONG_BREAK;

  return (
    <section className="flex flex-col items-center w-full select-none">
      {/* Big display */}
      <div className="w-full flex flex-col items-center pt-2 pb-1">
        <div className="flex items-center gap-3 mb-1">
          <span className="badge">{intervalName}</span>
          <span className={`font-data text-lg ${isRunning ? '' : 'dim'}`} aria-live="polite">
            {isRunning ? 'Running' : 'Paused'}
            {isRunning && <span className="blink">_</span>}
          </span>
          <span
            className="flex gap-1"
            role="img"
            aria-label={sessionsTowardLongBreak === null
              ? `Long break after ${SESSIONS_PER_LONG_BREAK} work sessions`
              : `${sessionsDone} of ${SESSIONS_PER_LONG_BREAK} work sessions done before a long break`}
          >
            {Array.from({ length: SESSIONS_PER_LONG_BREAK }, (_, index) => (
              <span key={index} className={`w-2.5 h-2.5 border-2 border-current ${index < sessionsDone ? 'bg-current' : ''}`} />
            ))}
          </span>
        </div>
        <div className="lcd">{formatTime(timeLeft)}</div>
      </div>

      <div
        className="progress w-full max-w-md mt-3"
        role="progressbar"
        aria-label={`${intervalName} interval elapsed`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(elapsedPercent)}
      >
        <div className="progress-fill" style={{ width: `${elapsedPercent}%` }} />
      </div>

      {/* Buttons */}
      <div className="flex flex-wrap items-center justify-center gap-4 mt-5">
        <button type="button" onClick={onToggleStart} className="btn btn-lg btn-default min-w-36">
          {isRunning ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
          <span>{isRunning ? 'Pause' : 'Start'}</span>
        </button>
        <button type="button" onClick={onReset} className="btn btn-lg">
          <RotateCcw className="w-5 h-5" strokeWidth={2.5} />
          <span>Reset</span>
        </button>
        {mode === 'break' && (
          <button type="button" onClick={onStartWork} className="btn btn-lg">
            <SkipForward className="w-5 h-5 fill-current" />
            <span>Start Work</span>
          </button>
        )}
      </div>

      {/* Interval sliders */}
      <div className="w-full max-w-md mt-6 grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-3 text-lg">
        <label htmlFor="work-minutes">Work</label>
        <input
          id="work-minutes"
          type="range"
          min="1"
          max="90"
          value={workMinutes}
          onChange={(e) => onChangeWorkMinutes(Number(e.target.value))}
          className="slider"
          aria-label="Work duration slider in minutes"
        />
        <span className="font-data text-xl w-14 text-right">{workMinutes} min</span>

        <label htmlFor="break-minutes">Break</label>
        <input
          id="break-minutes"
          type="range"
          min="1"
          max="45"
          value={breakMinutes}
          onChange={(e) => onChangeBreakMinutes(Number(e.target.value))}
          className="slider"
          aria-label="Break duration slider in minutes"
        />
        <span className="font-data text-xl w-14 text-right">{breakMinutes} min</span>

        <label htmlFor="long-break-minutes">Long break</label>
        <input
          id="long-break-minutes"
          type="range"
          min="5"
          max="45"
          value={longBreakMinutes}
          onChange={(e) => onChangeLongBreakMinutes(Number(e.target.value))}
          className="slider"
          aria-label="Long break duration slider in minutes"
        />
        <span className="font-data text-xl w-14 text-right">{longBreakMinutes} min</span>
      </div>

      {keepAwake !== null && (
        <div className="w-full max-w-md mt-4 flex items-center gap-3 text-lg">
          <button
            type="button"
            role="checkbox"
            aria-checked={keepAwake}
            aria-labelledby="keep-awake-label"
            onClick={() => onChangeKeepAwake(!keepAwake)}
            className="checkbox"
          >
            {keepAwake && <X />}
          </button>
          <span id="keep-awake-label" onClick={() => onChangeKeepAwake(!keepAwake)} className="cursor-pointer">
            Keep screen on while running
          </span>
        </div>
      )}
    </section>
  );
}
