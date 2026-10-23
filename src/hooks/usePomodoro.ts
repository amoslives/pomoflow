import { useCallback, useEffect, useRef, useState } from 'react';
import { parseStoredInteger, parseStoredJson } from '../utils/storage';
import { migrateLegacyStats, normalizeFocusStats, recordFocusSession, type FocusStats } from '../utils/stats';
import { secondsRemaining } from '../utils/timer';
import { playBreakCompleteChime, playClickSound, playWorkCompleteChime } from '../utils/audio';
import { SETTING_LIMITS } from '../utils/settings';

const STORAGE_KEY = 'pomodoro_session_v2';
// Every fourth completed work session is followed by a long break
export const SESSIONS_PER_LONG_BREAK = 4;
// Hidden tabs run timers about once a minute, so a later completion means the tab was not running
const LATE_ALERT_SECONDS = 120;
const [LONG_BREAK_MIN, LONG_BREAK_MAX] = SETTING_LIMITS.longBreakMinutes;

interface Session {
  mode: 'work' | 'break';
  remaining: number;
  endsAt: number | null;
  workMinutes: number;
  breakMinutes: number;
  longBreakMinutes: number;
  // Work sessions completed since the last long break, and whether the current break is that long break
  sessionsSinceLongBreak: number;
  longBreak: boolean;
  completedSessions: number;
  focusStats: FocusStats;
}

export type Interval = 'work' | 'break' | 'longBreak';
export type NotificationStatus = NotificationPermission | 'unsupported';
// An alert handled after its interval ended, because the tab was not running then
export interface LateAlert { interval: Interval; seconds: number }
const INTERVAL_KEYS = { work: 'workMinutes', break: 'breakMinutes', longBreak: 'longBreakMinutes' } as const;
const INTERVAL_LIMITS = {
  work: SETTING_LIMITS.workMinutes, break: SETTING_LIMITS.breakMinutes, longBreak: SETTING_LIMITS.longBreakMinutes,
} as const;

function currentInterval(value: Session): Interval {
  return value.mode === 'work' ? 'work' : value.longBreak ? 'longBreak' : 'break';
}

function intervalMinutes(value: Session): number {
  return value[INTERVAL_KEYS[currentInterval(value)]];
}

function readSession(): Session {
  const workMinutes = parseStoredInteger(localStorage.getItem('pomodoro_work_duration'), 25, 1, 90);
  const fallback: Session = {
    mode: 'work', remaining: workMinutes * 60, endsAt: null, workMinutes,
    breakMinutes: parseStoredInteger(localStorage.getItem('pomodoro_break_duration'), 5, 1, 45),
    longBreakMinutes: 15, sessionsSinceLongBreak: 0, longBreak: false,
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
  // Records saved before long breaks existed lack these fields
  const longBreakMinutes = Number.isInteger(value.longBreakMinutes)
    && value.longBreakMinutes! >= LONG_BREAK_MIN && value.longBreakMinutes! <= LONG_BREAK_MAX ? value.longBreakMinutes! : 15;
  const sessionsSinceLongBreak = Number.isInteger(value.sessionsSinceLongBreak)
    && value.sessionsSinceLongBreak! >= 0 && value.sessionsSinceLongBreak! < SESSIONS_PER_LONG_BREAK ? value.sessionsSinceLongBreak! : 0;
  return {
    ...value, longBreakMinutes, sessionsSinceLongBreak, longBreak: value.mode === 'break' && value.longBreak === true,
    focusStats: normalizeFocusStats(value.focusStats),
  } as Session;
}

function readNotificationStatus(): NotificationStatus {
  try { return 'Notification' in window ? Notification.permission : 'unsupported'; } catch { return 'unsupported'; }
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
  // Whether the user opened, focused or used the app since work last restarted by itself.
  // Loading the app counts.
  const respondedRef = useRef(true);
  const [timeLeft, setTimeLeft] = useState(() => session.endsAt === null ? session.remaining : secondsRemaining(session.endsAt));
  const [notificationStatus, setNotificationStatus] = useState(readNotificationStatus);
  // Whether Start asked for notifications in this page; until then a missing permission is not news
  const [notificationsAsked, setNotificationsAsked] = useState(false);
  const [lateAlert, setLateAlert] = useState<LateAlert | null>(null);

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
    const lateSeconds = Math.floor((Date.now() - value.endsAt) / 1000);
    setLateAlert(lateSeconds >= LATE_ALERT_SECONDS ? { interval: currentInterval(value), seconds: lateSeconds } : null);
    const sessionsSinceLongBreak = work ? value.sessionsSinceLongBreak + 1 : value.sessionsSinceLongBreak;
    const longBreak = work && sessionsSinceLongBreak >= SESSIONS_PER_LONG_BREAK;
    const breakMinutes = longBreak ? value.longBreakMinutes : value.breakMinutes;
    const nextSeconds = (work ? breakMinutes : value.workMinutes) * 60;
    // After a break, work restarts by itself only if the user responded during the last
    // cycle. An app left alone pauses after one more session instead of logging focus time.
    const autoStart = work || respondedRef.current;
    if (!work && autoStart) respondedRef.current = false;
    // Credit only the session actually started, never cycles fabricated while the
    // browser was suspended. The next cycle begins when this completion is handled.
    commit({
      ...value, mode: work ? 'break' : 'work', remaining: nextSeconds,
      endsAt: autoStart ? Date.now() + nextSeconds * 1000 : null,
      sessionsSinceLongBreak: longBreak ? 0 : sessionsSinceLongBreak, longBreak,
      completedSessions: value.completedSessions + (work ? 1 : 0),
      focusStats: work ? recordFocusSession(value.focusStats, value.workMinutes, new Date(value.endsAt)) : value.focusStats,
    });
    try { if (work) playWorkCompleteChime(); else playBreakCompleteChime(); } catch {}
    void notify(work ? 'Pomodoro Complete!' : 'Break Finished!', work
      ? `Great job! Time for a ${breakMinutes} minute ${longBreak ? 'long break' : 'break'}.`
      : autoStart
        ? `Your ${value.workMinutes} minute work session has started.`
        : `Timer paused. Press Start for your ${value.workMinutes} minute work session.`);
  }, [commit]);

  // Follows changes made in the browser's site settings while the app is open
  useEffect(() => {
    const update = () => setNotificationStatus(readNotificationStatus());
    let disposed = false;
    let permission: PermissionStatus | undefined;
    try {
      navigator.permissions?.query({ name: 'notifications' }).then((status) => {
        if (disposed) return;
        permission = status;
        status.addEventListener('change', update);
      }, () => {});
    } catch { /* Older browsers throw for a permission they do not know */ }
    window.addEventListener('focus', update);
    return () => {
      disposed = true;
      permission?.removeEventListener('change', update);
      window.removeEventListener('focus', update);
    };
  }, []);

  // Asks while handling a click or key press, which browsers require for the prompt
  const requestNotifications = useCallback(() => {
    try {
      if ('Notification' in window && Notification.permission === 'default') {
        void Notification.requestPermission()
          .then((result) => setNotificationStatus(result), () => {})
          .finally(() => setNotificationsAsked(true));
        return;
      }
    } catch {}
    setNotificationStatus(readNotificationStatus());
    setNotificationsAsked(true);
  }, []);

  useEffect(() => {
    // Opening, focusing or using the app is a response; it must count before a catch-up tick
    const respond = () => { if (document.visibilityState === 'visible') respondedRef.current = true; };
    const respondAndTick = () => { respond(); tick(); };
    tick();
    const interval = window.setInterval(tick, 1000);
    window.addEventListener('focus', respondAndTick);
    document.addEventListener('visibilitychange', respondAndTick);
    window.addEventListener('pointerdown', respond, true);
    window.addEventListener('keydown', respond, true);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', respondAndTick);
      document.removeEventListener('visibilitychange', respondAndTick);
      window.removeEventListener('pointerdown', respond, true);
      window.removeEventListener('keydown', respond, true);
    };
  }, [tick]);

  const toggleTimer = useCallback(() => {
    tick();
    const value = current.current;
    playClickSound();
    if (value.endsAt === null) {
      requestNotifications();
      commit({ ...value, endsAt: Date.now() + value.remaining * 1000 });
    } else commit({ ...value, remaining: secondsRemaining(value.endsAt), endsAt: null });
  }, [commit, tick, requestNotifications]);

  const resetTimer = useCallback(() => {
    const value = current.current;
    playClickSound();
    commit({ ...value, endsAt: null, remaining: intervalMinutes(value) * 60 });
  }, [commit]);

  const startWork = useCallback(() => {
    const value = current.current;
    if (value.mode !== 'break') return;
    const remaining = value.workMinutes * 60;
    playClickSound();
    commit({ ...value, mode: 'work', longBreak: false, remaining, endsAt: Date.now() + remaining * 1000 });
  }, [commit]);

  const changeDuration = (interval: Interval, minutes: number) => {
    tick();
    const value = current.current;
    const [minimum, maximum] = INTERVAL_LIMITS[interval];
    if (!Number.isInteger(minutes) || minutes < minimum || minutes > maximum) return;
    const durationKey = INTERVAL_KEYS[interval];
    const isCurrent = currentInterval(value) === interval;
    if (!isCurrent || value.endsAt === null) {
      commit({ ...value, [durationKey]: minutes,
        remaining: isCurrent ? minutes * 60 : value.remaining });
      return;
    }

    // Leave at least a minute on a running timer, so dragging the slider down cannot end the session
    const elapsed = value[durationKey] * 60 - secondsRemaining(value.endsAt);
    const nextMinutes = Math.max(minutes, Math.ceil((elapsed + 60) / 60));
    if (nextMinutes > maximum) return;
    const endsAt = value.endsAt + (nextMinutes - value[durationKey]) * 60 * 1000;
    commit({ ...value, [durationKey]: nextMinutes, endsAt, remaining: secondsRemaining(endsAt) });
  };

  // Lengths from a paired device; like the sliders, a running interval keeps at least a minute
  const applyDurations = (durations: { workMinutes: number; breakMinutes: number; longBreakMinutes: number }) => {
    changeDuration('work', durations.workMinutes);
    changeDuration('break', durations.breakMinutes);
    changeDuration('longBreak', durations.longBreakMinutes);
  };

  return { ...session, timeLeft, isRunning: session.endsAt !== null, intervalMinutes: intervalMinutes(session),
    // Why alerts cannot reach the user, once Start has asked for notifications
    notificationsOff: notificationsAsked && notificationStatus !== 'granted' ? notificationStatus : null,
    lateAlert, requestNotifications,
    toggleTimer, resetTimer, startWork, applyDurations,
    handleWorkDurationChange: (minutes: number) => changeDuration('work', minutes),
    handleBreakDurationChange: (minutes: number) => changeDuration('break', minutes),
    handleLongBreakDurationChange: (minutes: number) => changeDuration('longBreak', minutes) };
}
