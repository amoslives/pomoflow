import { expect, test, type Page } from '@playwright/test';

// A paused clock keeps the countdown exact between steps
async function openWithPausedClock(page: Page) {
  await page.clock.install({ time: new Date('2026-10-22T09:00:00') });
  await page.goto('/');
  await page.clock.pauseAt(new Date('2026-10-22T09:00:05'));
}

test('the tab title shows the countdown while the timer runs', async ({ page }) => {
  await openWithPausedClock(page);
  const defaultTitle = await page.title();
  await page.getByRole('button', { name: /^start$/i }).click();
  await page.clock.fastForward(61_000);
  await expect(page).toHaveTitle('23:59 · Work');
  await page.getByRole('button', { name: /^pause$/i }).click();
  await expect(page).toHaveTitle(defaultTitle);
});

test('every fourth work session is followed by a long break', async ({ page }) => {
  await openWithPausedClock(page);
  await page.getByLabel('Work duration slider in minutes').fill('1');
  await page.getByLabel('Break duration slider in minutes', { exact: true }).fill('1');
  const badge = page.locator('.badge');
  const progress = page.getByRole('img', { name: /long break/i });
  await expect(progress).toHaveAccessibleName('0 of 4 work sessions done before a long break');

  await page.getByRole('button', { name: /^start$/i }).click();
  for (let session = 1; session <= 3; session++) {
    await page.clock.fastForward(60_000);
    await expect(badge).toHaveText('Break');
    await expect(page.getByText('01:00', { exact: true })).toBeVisible();
    await expect(progress).toHaveAccessibleName(`${session} of 4 work sessions done before a long break`);
    // The user is around, so work restarts after the break
    await page.evaluate(() => window.dispatchEvent(new Event('pointerdown')));
    await page.clock.fastForward(60_000);
    await expect(badge).toHaveText('Work');
  }

  await page.clock.fastForward(60_000);
  await expect(badge).toHaveText('Long break');
  await expect(page.getByText('15:00', { exact: true })).toBeVisible();
  await expect(page).toHaveTitle('15:00 · Long break');
  await expect(progress).toHaveAccessibleName('Long break after 4 work sessions');

  // The running long break follows its slider
  await page.getByLabel('Long break duration slider in minutes').fill('20');
  await expect(page.getByText('20:00', { exact: true })).toBeVisible();

  await page.clock.fastForward(20 * 60_000);
  await expect(badge).toHaveText('Work');
  await expect(progress).toHaveAccessibleName('0 of 4 work sessions done before a long break');
  await expect(page.getByText('4 timers completed', { exact: true })).toBeVisible();
});

test('a timer saved before long breaks existed keeps running', async ({ page }) => {
  await openWithPausedClock(page);
  await page.evaluate(() => localStorage.setItem('pomodoro_session_v2', JSON.stringify({
    mode: 'work', remaining: 1500, endsAt: Date.now() + 600_000, workMinutes: 25, breakMinutes: 5,
    completedSessions: 3, focusStats: {},
  })));
  await page.reload();
  await expect(page.getByText('10:00', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^pause$/i })).toBeVisible();
  await expect(page.getByLabel('Long break duration slider in minutes')).toHaveValue('15');
  await expect(page.getByText('3 timers completed', { exact: true })).toBeVisible();
});

test.describe('keep screen on', () => {
  test.beforeEach(async ({ page }) => {
    // Record wake lock requests and releases; keep the last lock so a test can release it like the browser does
    await page.addInitScript(() => {
      const log: string[] = [];
      (window as any).__wakeLog = log;
      Object.defineProperty(navigator, 'wakeLock', {
        configurable: true,
        value: {
          request: async () => {
            log.push('request');
            const lock = new EventTarget() as EventTarget & { release: () => Promise<void> };
            lock.release = async () => { log.push('release'); lock.dispatchEvent(new Event('release')); };
            (window as any).__wakeLock = lock;
            return lock;
          },
        },
      });
    });
    await page.goto('/');
  });

  const wakeLog = (page: Page) => page.evaluate(() => (window as any).__wakeLog);

  test('keeps the screen awake only while the timer runs, and remembers the choice', async ({ page }) => {
    const keepAwake = page.getByRole('checkbox', { name: 'Keep screen on while running' });
    await expect(keepAwake).toHaveAttribute('aria-checked', 'false');
    await page.getByRole('button', { name: /^start$/i }).click();
    await page.waitForTimeout(200);
    expect(await wakeLog(page)).toEqual([]);

    await keepAwake.click();
    await expect.poll(() => wakeLog(page)).toEqual(['request']);
    await page.getByRole('button', { name: /^pause$/i }).click();
    await expect.poll(() => wakeLog(page)).toEqual(['request', 'release']);

    await page.reload();
    await expect(keepAwake).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('button', { name: /^start$/i }).click();
    await expect.poll(() => wakeLog(page)).toEqual(['request']);
    await keepAwake.click();
    await expect.poll(() => wakeLog(page)).toEqual(['request', 'release']);
  });

  test('asks again after the browser releases the lock for a hidden page', async ({ page }) => {
    await page.getByRole('checkbox', { name: 'Keep screen on while running' }).click();
    await page.getByRole('button', { name: /^start$/i }).click();
    await expect.poll(() => wakeLog(page)).toEqual(['request']);

    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      (window as any).__wakeLock.dispatchEvent(new Event('release'));
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(() => wakeLog(page)).toEqual(['request', 'request']);
  });
});
