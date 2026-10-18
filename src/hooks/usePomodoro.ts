import { useCallback, useEffect, useRef, useState } from 'react';
import { parseStoredInteger, parseStoredJson } from '../utils/storage';
import { migrateLegacyStats, normalizeFocusStats, recordFocusSession, type FocusStats } from '../utils/stats';
import { secondsRemaining } from '../utils/timer';
import { playBreakCompleteChime, playClickSound, playWorkCompleteChime } from '../utils/audio';

const STORAGE_KEY = 'pomodoro_session_v2';
interface Session {
  mode: 'work' | 'break';
  remaining: number;
  endsAt: number | null;
  workMinutes: number;
  breakMinutes: number;
  completedSessions: number;
  focusStats: FocusStats;
}

function readSession(): Session {
  const workMinutes = parseStoredInteger(localStorage.getItem('pomodoro_work_duration'), 25, 1, 90);
  const fallback: Session = {
    mode: 'work', remaining: workMinutes * 60, endsAt: null, workMinutes,
    breakMinutes: parseStoredInteger(localStorage.getItem('pomodoro_break_duration'), 5, 1, 45),
    completedSessions: parseStoredInteger(localStorage.getItem('pomodoro_completed_sessions'), 0, 0, Number.MAX_SAFE_INTEGER),
    focusStats: localStorage.getItem('pomodoro_focus_stats_v2')
      ? normalizeFocusStats(parseStoredJson(localStorage.getItem('pomodoro_focus_stats_v2')))
      : migrateLegacyStats(parseStoredJson(localStorage.getItem('pomodoro_daily_stats')), workMinutes),
  };
  const value = parseStoredJson(localStorage.getItem(STORAGE_KEY)) as Partial<Session> | null;
  if (!value || !['work', 'break'].includes(value.mode || '')
    || !Number.isInteger(value.workMinutes) || value.workMinutes! < 1 || value.workMinutes! > 90
    || !Number.isInteger(value.breakMinutes) || value.breakMinutes! < 1 || value.breakMinutes! > 45
    || typeof value.remaining !== 'number' || !Number.isFinite(value.remaining) || value.remaining < 0 || value.remaining > 5400
    || (value.endsAt !== null && (typeof value.endsAt !== 'number' || !Number.isFinite(value.endsAt)))
    || !Number.isSafeInteger(value.completedSessions) || value.completedSessions! < 0) return fallback;
  return { ...value, focusStats: normalizeFocusStats(value.focusStats) } as Session;
}

async function notify(title: string, body: string) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (registration) await registration.showNotification(title, { body });
    else new Notification(title, { body });
  } catch { /* Notifications are best-effort; Android rejects the constructor. */ }
}

export function usePomodoro() {
  const [session, setSession] = useState(readSession);
  const current = useRef(session);
  const [timeLeft, setTimeLeft] = useState(() => session.endsAt === null ? session.remaining : secondsRemaining(session.endsAt));

  const commit = useCallback((next: Session) => {
    // One record commits the completion and its credit together, before any alerts.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    current.current = next;
    setSession(next);
    setTimeLeft(next.endsAt === null ? next.remaining : secondsRemaining(next.endsAt));
  }, []);

  const tick = useCallback(() => {
    const value = current.current;
    if (value.endsAt === null) return;
    const remaining = secondsRemaining(value.endsAt);
    if (remaining > 0) { setTimeLeft(remaining); return; }
    const work = value.mode === 'work';
    const nextSeconds = (work ? value.breakMinutes : value.workMinutes) * 60;
    // Credit only the session actually started, never cycles fabricated while the
    // browser was suspended. The next cycle begins when this completion is handled.
    commit({
      ...value, mode: work ? 'break' : 'work', remaining: nextSeconds,
      endsAt: Date.now() + nextSeconds * 1000,
      completedSessions: value.completedSessions + (work ? 1 : 0),
      focusStats: work ? recordFocusSession(value.focusStats, value.workMinutes, new Date(value.endsAt)) : value.focusStats,
    });
    try { if (work) playWorkCompleteChime(); else playBreakCompleteChime(); } catch {}
    void notify(work ? 'Pomodoro Complete!' : 'Break Finished!', work
      ? `Great job! Time for a ${value.breakMinutes} minute break.`
      : `Time to start your ${value.workMinutes} minute work session.`);
  }, [commit]);

  useEffect(() => {
    tick();
    const interval = window.setInterval(tick, 1000);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [tick]);

  const toggleTimer = useCallback(() => {
    tick();
    const value = current.current;
    playClickSound();
    if (value.endsAt === null) {
      try {
        if ('Notification' in window && Notification.permission === 'default') {
          void Notification.requestPermission().catch(() => {});
        }
      } catch {}
      commit({ ...value, endsAt: Date.now() + value.remaining * 1000 });
    } else commit({ ...value, remaining: secondsRemaining(value.endsAt), endsAt: null });
  }, [commit, tick]);

  const resetTimer = useCallback(() => {
    const value = current.current;
    playClickSound();
    commit({ ...value, endsAt: null, remaining: (value.mode === 'work' ? value.workMinutes : value.breakMinutes) * 60 });
  }, [commit]);

  const changeDuration = (mode: 'work' | 'break', minutes: number) => {
    const value = current.current;
    if (value.endsAt !== null || !Number.isInteger(minutes) || minutes < 1 || minutes > (mode === 'work' ? 90 : 45)) return;
    commit({ ...value, [mode === 'work' ? 'workMinutes' : 'breakMinutes']: minutes,
      remaining: value.mode === mode ? minutes * 60 : value.remaining });
  };

  return { ...session, timeLeft, isRunning: session.endsAt !== null, toggleTimer, resetTimer,
    handleWorkDurationChange: (minutes: number) => changeDuration('work', minutes),
    handleBreakDurationChange: (minutes: number) => changeDuration('break', minutes) };
}
