import { expect, test, type Page } from '@playwright/test';
import { preserveNavigationTiming } from '../helpers/navigation-timing';

test.beforeEach(async ({ context }) => { await preserveNavigationTiming(context); });

async function openWithPausedClock(page: Page) {
  await page.clock.install({ time: new Date('2026-10-22T09:00:00') });
  await page.goto('/');
  await page.clock.pauseAt(new Date('2026-10-22T09:00:05'));
}

const savedSession = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('pomodoro_session_v2')!));

for (const mode of ['work', 'break'] as const) {
  test(`closing and reopening a running ${mode} restores it paused without crediting time away`, async ({ page, context }) => {
    await openWithPausedClock(page);
    await page.getByRole('button', { name: /^start$/i }).click();
    if (mode === 'break') await page.clock.fastForward(25 * 60_000);
    await page.clock.fastForward(60_000);
    const before = await savedSession(page);
    const display = mode === 'work' ? '24:00' : '04:00';
    await expect(page.getByText(display, { exact: true })).toBeVisible();
    await page.close();

    const reopened = await context.newPage();
    // Reopen hours after both the work and break deadlines would have passed.
    await reopened.clock.install({ time: new Date('2026-10-22T12:00:00') });
    await reopened.goto('/');
    await expect(reopened.getByRole('button', { name: /^start$/i })).toBeVisible();
    await expect(reopened.getByText(display, { exact: true })).toBeVisible();
    await expect(reopened.locator('.badge')).toHaveText(mode === 'work' ? 'Work' : 'Break');
    expect(await savedSession(reopened)).toMatchObject({
      remaining: before.remaining, endsAt: null,
      completedSessions: before.completedSessions, focusStats: before.focusStats,
    });

    // Neither waiting nor refreshing the reopened page resurrects the old deadline.
    await reopened.clock.fastForward(60 * 60_000);
    await reopened.reload();
    await expect(reopened.getByRole('button', { name: /^start$/i })).toBeVisible();
    await expect(reopened.getByText(display, { exact: true })).toBeVisible();
    expect((await savedSession(reopened)).focusStats).toEqual(before.focusStats);

    await reopened.getByRole('button', { name: /^start$/i }).click();
    await reopened.clock.fastForward(before.remaining * 1000);
    await expect(reopened.locator('.badge')).toHaveText(mode === 'work' ? 'Break' : 'Work');
    expect((await savedSession(reopened)).completedSessions).toBe(before.completedSessions + (mode === 'work' ? 1 : 0));
  });
}

test('refresh keeps a running deadline and credits completion only once', async ({ page }) => {
  await openWithPausedClock(page);
  await page.getByRole('button', { name: /^start$/i }).click();
  await page.clock.fastForward(10 * 60_000);
  const before = await savedSession(page);
  await page.reload();
  await expect(page.getByRole('button', { name: /^pause$/i })).toBeVisible();
  await expect(page.getByText('15:00', { exact: true })).toBeVisible();
  expect((await savedSession(page)).endsAt).toBe(before.endsAt);
  await page.clock.fastForward(15 * 60_000);
  await expect(page.getByText('1 timer completed', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('1 timer completed', { exact: true })).toBeVisible();
});

test('hiding or suspending the same page keeps counting from its deadline', async ({ page }) => {
  await openWithPausedClock(page);
  await page.getByRole('button', { name: /^start$/i }).click();
  const before = await savedSession(page);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  // Model a locked phone: no callbacks run during these ten minutes.
  await page.clock.setSystemTime(new Date('2026-10-22T09:10:05'));
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });
  await expect(page.getByRole('button', { name: /^pause$/i })).toBeVisible();
  await expect(page.getByText('15:00', { exact: true })).toBeVisible();
  expect((await savedSession(page)).endsAt).toBe(before.endsAt);
  await page.clock.fastForward(15 * 60_000);
  await expect(page.getByText('1 timer completed', { exact: true })).toBeVisible();
});

test('a killed app with an expired deadline restores its checkpoint without credit', async ({ page }) => {
  // A crash/OS kill need not send pagehide. Seed exactly the last live checkpoint.
  await page.addInitScript(() => {
    localStorage.setItem('pomodoro_session_v2', JSON.stringify({
      mode: 'work', remaining: 1200, endsAt: Date.now() - 3_600_000,
      workMinutes: 25, breakMinutes: 5, longBreakMinutes: 15,
      sessionsSinceLongBreak: 2, longBreak: false, completedSessions: 2,
      focusStats: { '2026-10-21': { sessions: 2, minutes: 50 } },
    }));
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: /^start$/i })).toBeVisible();
  await expect(page.getByText('20:00', { exact: true })).toBeVisible();
  await expect(page.getByText('2 timers completed', { exact: true })).toBeVisible();
  expect(await savedSession(page)).toMatchObject({
    endsAt: null, sessionsSinceLongBreak: 2,
    focusStats: { '2026-10-21': { sessions: 2, minutes: 50 } },
  });
});

test('navigating away and returning through browser history restores paused', async ({ page }) => {
  await openWithPausedClock(page);
  await page.getByRole('button', { name: /^start$/i }).click();
  await page.clock.fastForward(60_000);
  await page.goto('/404.html');
  await page.clock.setSystemTime(new Date('2026-10-22T12:00:00'));
  await page.goBack();
  await expect(page.getByRole('button', { name: /^start$/i })).toBeVisible();
  await expect(page.getByText('24:00', { exact: true })).toBeVisible();
  await expect(page.getByText('0 timers completed', { exact: true })).toBeVisible();
});

test('pagehide checkpoints between ticks and back/forward-cache restoration stays paused', async ({ page }) => {
  await openWithPausedClock(page);
  await page.getByRole('button', { name: /^start$/i }).click();
  // Move the clock without firing a tick; pagehide must save the actual time left.
  await page.clock.setSystemTime(new Date('2026-10-22T09:02:05'));
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  expect((await savedSession(page)).remaining).toBe(23 * 60);
  await page.clock.setSystemTime(new Date('2026-10-22T12:00:00'));
  await page.evaluate(() => {
    // A browser may deliver visibility/focus before pageshow.
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  await expect(page.getByRole('button', { name: /^start$/i })).toBeVisible();
  await expect(page.getByText('23:00', { exact: true })).toBeVisible();
  await expect(page.getByText('0 timers completed', { exact: true })).toBeVisible();
  expect((await savedSession(page)).endsAt).toBeNull();
});
