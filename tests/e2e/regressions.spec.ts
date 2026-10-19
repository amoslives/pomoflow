import { expect, test } from '@playwright/test';

test('a throwing notification cannot lose a finished session', async ({ page }) => {
  await page.addInitScript(() => {
    class UnsupportedNotification {
      static permission = 'granted';
      constructor() { throw new TypeError('Illegal constructor'); }
    }
    Object.defineProperty(window, 'Notification', { value: UnsupportedNotification });
  });
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('button', { name: /^start$/i }).click();
  await page.clock.fastForward(25 * 60 * 1000);
  await expect(page.getByText('1 timer completed', { exact: true })).toBeVisible();
  await expect(page.getByText('Pomoflow could not load')).toHaveCount(0);
});

test('a suspended timer catches up, survives reload, and credits once', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('button', { name: /^start$/i }).click();
  await page.clock.fastForward(10 * 60 * 1000);
  await expect(page.getByText('15:00', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('15:00', { exact: true })).toBeVisible();
  await page.clock.fastForward(15 * 60 * 1000);
  await expect(page.getByText('1 timer completed', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('1 timer completed', { exact: true })).toBeVisible();
});

test('running timer durations remain adjustable and preserve elapsed time', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('button', { name: /^start$/i }).click();
  await page.clock.fastForward(5 * 60 * 1000);
  await expect(page.getByText('20:00', { exact: true })).toBeVisible();

  const workDuration = page.getByLabel('Work duration slider in minutes');
  const breakDuration = page.getByLabel('Break duration slider in minutes');
  await expect(workDuration).toBeEnabled();
  await expect(breakDuration).toBeEnabled();
  await breakDuration.fill('10');
  await expect(page.getByText('20:00', { exact: true })).toBeVisible();
  await workDuration.fill('30');
  await expect(page.getByText('25:00', { exact: true })).toBeVisible();

  await expect.poll(() => page.evaluate(() => {
    const session = JSON.parse(localStorage.getItem('pomodoro_session_v2')!);
    return { workMinutes: session.workMinutes, breakMinutes: session.breakMinutes };
  })).toEqual({ workMinutes: 30, breakMinutes: 10 });

  await page.clock.fastForward(25 * 60 * 1000);
  await expect(page.locator('.badge')).toHaveText('Break');
  await expect(page.getByText('10:00', { exact: true })).toBeVisible();
  await page.clock.fastForward(2 * 60 * 1000);
  await breakDuration.fill('15');
  await expect(page.getByText('13:00', { exact: true })).toBeVisible();
});

test('a running break can be abandoned for a fresh work session', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('button', { name: /^start$/i }).click();
  await page.clock.fastForward(25 * 60 * 1000);
  await expect(page.locator('.badge')).toHaveText('Break');
  await expect(page.getByText('1 timer completed', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Start Work', exact: true }).click();
  await expect(page.locator('.badge')).toHaveText('Work');
  await expect(page.getByText('25:00', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^pause$/i })).toBeVisible();
  await expect(page.getByText('1 timer completed', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const session = JSON.parse(localStorage.getItem('pomodoro_session_v2')!);
    return { mode: session.mode, isRunning: session.endsAt !== null };
  })).toEqual({ mode: 'work', isRunning: true });
});

test('browser shortcuts, repeat, and modal keys do not control the timer', async ({ page }) => {
  await page.goto('/');
  const prevented = await page.evaluate(() => {
    const event = new KeyboardEvent('keydown', { key: 'd', code: 'KeyD', ctrlKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(event);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', repeat: true, bubbles: true }));
    return event.defaultPrevented;
  });
  expect(prevented).toBe(false);
  await expect(page.getByRole('button', { name: /^start$/i })).toBeVisible();
  await page.getByRole('button', { name: /open sync settings/i }).click();
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: 'Close sync modal' }).click();
  await expect(page.getByRole('button', { name: /^start$/i })).toBeVisible();
});

test('paused sessions and overdue sessions survive relaunch without duplicate credit', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('button', { name: /^start$/i }).click();
  await page.clock.fastForward(60_000);
  await page.getByRole('button', { name: /^pause$/i }).click();
  await page.reload();
  await expect(page.getByText('24:00', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^start$/i })).toBeVisible();
  await page.getByRole('button', { name: /^start$/i }).click();
  // Simulate an OS-killed app: no callbacks run before the saved deadline passes.
  await page.evaluate(() => {
    const value = JSON.parse(localStorage.getItem('pomodoro_session_v2')!);
    value.endsAt = Date.now() - 10_000;
    localStorage.setItem('pomodoro_session_v2', JSON.stringify(value));
  });
  await page.reload();
  await expect(page.getByText('1 timer completed', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('1 timer completed', { exact: true })).toBeVisible();
});

test('browser chrome follows the selected theme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await page.getByRole('button', { name: /Theme: system/i }).click();
  await page.getByRole('button', { name: /Theme: light/i }).click();
  await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute('content', '#121212');
  expect(await page.locator('meta[name="theme-color"][media]').count()).toBe(0);
});

test('YouTube is not contacted before the user enables playback', async ({ page }) => {
  const youtubeRequests: string[] = [];
  page.on('request', request => { if (/(^|\.)(youtube\.com|youtube-nocookie\.com|ytimg\.com)$/.test(new URL(request.url()).hostname)) youtubeRequests.push(request.url()); });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Play music', exact: true })).toBeVisible();
  expect(youtubeRequests).toEqual([]);
});
