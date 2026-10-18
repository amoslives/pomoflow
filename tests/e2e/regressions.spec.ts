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
