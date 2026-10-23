import { expect, test } from '@playwright/test';

// Headless Chromium denies notifications whatever the permission, so each test reports its own

test('Start reports notifications the browser blocked', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Notification, 'permission', { configurable: true, get: () => 'denied' });
  });
  await page.goto('/');
  const note = page.getByText('Notifications are blocked for this site. Turn them on in the browser\'s site settings.');
  await expect(note).toHaveCount(0);
  await page.getByRole('button', { name: /^start$/i }).click();
  await expect(note).toBeVisible();
});

test('a dismissed prompt can be answered from the timer', async ({ page }) => {
  await page.addInitScript(() => {
    let permission: NotificationPermission = 'default';
    // The first prompt is dismissed, the second allowed
    const answers: NotificationPermission[] = ['default', 'granted'];
    Object.defineProperty(Notification, 'permission', { configurable: true, get: () => permission });
    Notification.requestPermission = async () => (permission = answers.shift() ?? permission);
  });
  await page.goto('/');
  await page.getByRole('button', { name: /^start$/i }).click();
  await expect(page.getByText(/^Notifications are off\./)).toBeVisible();
  await page.getByRole('button', { name: 'Allow notifications' }).click();
  await expect(page.getByText(/^Notifications are off\./)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Allow notifications' })).toHaveCount(0);
});

test('allowed notifications add no note', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Notification, 'permission', { configurable: true, get: () => 'granted' });
  });
  await page.goto('/');
  await page.getByRole('button', { name: /^start$/i }).click();
  await expect(page.getByRole('button', { name: /^pause$/i })).toBeVisible();
  await expect(page.getByRole('status')).toBeEmpty();
});

test('Start reports a browser without notifications', async ({ page }) => {
  await page.addInitScript(() => { delete (window as { Notification?: unknown }).Notification; });
  await page.goto('/');
  await page.getByRole('button', { name: /^start$/i }).click();
  await expect(page.getByText(/^This browser can't show notifications\./)).toBeVisible();
});

test('an alert handled after the tab stopped running says how late it came', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Notification, 'permission', { configurable: true, get: () => 'granted' });
  });
  await page.clock.install({ time: new Date('2026-10-22T09:00:00') });
  await page.goto('/');
  await page.clock.pauseAt(new Date('2026-10-22T09:00:05'));
  await page.getByRole('button', { name: /^start$/i }).click();
  // No timer fires while the tab is asleep; it wakes 12 minutes after the session ended
  await page.clock.setSystemTime(new Date('2026-10-22T09:37:05'));
  await page.clock.runFor(1000);
  await expect(page.locator('.badge')).toHaveText('Break');
  const late = page.getByText('This tab wasn\'t running when the work session ended, so the alert came 12 min late.');
  await expect(late).toBeVisible();

  // The break ends on time, so its alert clears the note
  await page.clock.fastForward(5 * 60 * 1000);
  await expect(page.locator('.badge')).toHaveText('Work');
  await expect(late).toHaveCount(0);
});

test('an alert handled within a throttled minute adds no note', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Notification, 'permission', { configurable: true, get: () => 'granted' });
  });
  await page.clock.install({ time: new Date('2026-10-22T09:00:00') });
  await page.goto('/');
  await page.clock.pauseAt(new Date('2026-10-22T09:00:05'));
  await page.getByRole('button', { name: /^start$/i }).click();
  // Hidden tabs run timers about once a minute
  await page.clock.setSystemTime(new Date('2026-10-22T09:26:00'));
  await page.clock.runFor(1000);
  await expect(page.locator('.badge')).toHaveText('Break');
  await expect(page.getByRole('status')).toBeEmpty();
});
