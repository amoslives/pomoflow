import { expect, test } from '@playwright/test';

// The service worker exists only in production builds (see playwright.config.ts)
test.use({ baseURL: 'http://127.0.0.1:3100' });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
    }
  });
});

test('the installed app opens offline after its first visit', async ({ page, context }) => {
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: /^start$/i })).toBeVisible();
  // The stats view is a separate file that loads on demand
  await page.getByRole('button', { name: 'Stats', exact: true }).click();
  await expect(page.getByText(/No focus sessions yet/i)).toBeVisible();

  const another = await context.newPage();
  await another.goto('/');
  await expect(another.getByRole('button', { name: /^start$/i })).toBeVisible();
});

test('a finished work session notifies through the service worker', async ({ page }) => {
  // The headless Chromium that CI runs denies notifications whatever the permission, so report
  // the permission as granted and record the call. The registration is the route Android needs.
  await page.addInitScript(() => {
    const calls: string[] = [];
    (window as any).__notifications = calls;
    Object.defineProperty(Notification, 'permission', { configurable: true, get: () => 'granted' });
    ServiceWorkerRegistration.prototype.showNotification = async function (title) { calls.push(title); };
  });
  await page.clock.install();
  await page.reload();
  await page.getByRole('button', { name: /^start$/i }).click();
  await page.clock.fastForward(25 * 60 * 1000);
  await expect(page.locator('.badge')).toHaveText('Break');
  await expect.poll(() => page.evaluate(() => (window as any).__notifications)).toEqual(['Pomodoro Complete!']);
});
