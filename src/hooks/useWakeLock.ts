import { useEffect } from 'react';

export const wakeLockSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

/**
 * Keeps the screen awake while `active` is true. Browsers release the lock when the page
 * is hidden, so it is requested again each time the page becomes visible.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !wakeLockSupported) return;
    let lock: WakeLockSentinel | null = null;
    let requesting = false;
    let stopped = false;

    const acquire = async () => {
      if (lock || requesting || stopped || document.visibilityState !== 'visible') return;
      requesting = true;
      try {
        const next = await navigator.wakeLock.request('screen');
        if (stopped) {
          void next.release();
          return;
        }
        lock = next;
        next.addEventListener('release', () => { if (lock === next) lock = null; });
      } catch {
        // Refused, for example in power-saving mode; the screen may sleep as usual.
      } finally {
        requesting = false;
      }
    };

    void acquire();
    const handleVisibilityChange = () => { void acquire(); };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      void lock?.release().catch(() => {});
      lock = null;
    };
  }, [active]);
}
