/**
 * Pure timer and audio utilities for Pomoflow
 */

export function formatTime(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  const mm = minutes < 10 ? `0${minutes}` : `${minutes}`;
  const ss = seconds < 10 ? `0${seconds}` : `${seconds}`;
  return `${mm}:${ss}`;
}

/**
 * How late an alert came, in whole minutes, with hours once it reaches an hour
 */
export function formatLateness(totalSeconds: number): string {
  const minutes = Math.max(1, Math.round(totalSeconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export function calculateProgress(remainingSeconds: number, totalSeconds: number): number {
  if (totalSeconds <= 0) return 0;
  const progress = ((totalSeconds - remainingSeconds) / totalSeconds) * 100;
  return Math.min(100, Math.max(0, progress));
}

export function getStrokeDashoffset(progressPercent: number, circumference: number): number {
  const safePercent = Math.min(100, Math.max(0, progressPercent));
  return circumference - (safePercent / 100) * circumference;
}

/**
 * Seconds left until endsAt, rounded up so the display never shows 00:00 early.
 * Tabs throttle timers, so the countdown must be derived from the clock, not ticks.
 */
export function secondsRemaining(endsAt: number, now: number = Date.now()): number {
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

export function parseYouTubeId(input: string): string | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();

  // Common YouTube URL regex matching youtube.com or youtu.be
  const urlRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|live|watch)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
  const urlMatch = trimmed.match(urlRegex);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }

  // If user pasted raw 11-character YouTube video ID (alphanumeric and _ -) without url scheme or words
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed) && !trimmed.includes('/') && !trimmed.includes(' ') && !trimmed.startsWith('invalid-')) {
    return trimmed;
  }

  return null;
}

export function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}
