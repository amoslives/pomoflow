import { expect, test, type Browser, type Page } from '@playwright/test';
import { decryptDocument, generateSyncKey, syncCredential } from '../../src/utils/sync';
import type { FocusStats } from '../../src/utils/stats';

const APP = 'http://127.0.0.1:3000/';

// A device is its own browser context, on Thursday 22 October 2026
async function device(browser: Browser, setup: Record<string, string> = {}) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.clock.install({ time: new Date('2026-10-22T09:00:00') });
  await page.goto(APP);
  await page.evaluate((values) => { for (const [name, value] of Object.entries(values)) localStorage.setItem(name, value); }, setup);
  await page.reload();
  return { context, page };
}

const history = (stats: FocusStats) => ({ pomodoro_focus_stats_v2: JSON.stringify(stats) });

async function pair(page: Page, key: string) {
  await page.goto(`${APP}#sync=${key}`);
  await page.getByRole('button', { name: 'Use room tasks only' }).click();
  await expect(page.getByRole('button', { name: /Open sync settings: Synced/i })).toBeVisible();
}

// Sync now, as returning to the app does
const resync = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event('focus')));

async function room(page: Page, key: string) {
  const response = await page.request.get(`${APP}api/tasks`, { headers: { Authorization: `Bearer ${await syncCredential(key)}` } });
  return decryptDocument(key, (await response.json()).encrypted);
}

async function openStats(page: Page) {
  await page.getByRole('button', { name: 'Stats', exact: true }).click();
}

test('paired devices add up their focus stats, and each keeps only its own', async ({ browser }) => {
  const key = generateSyncKey();
  const laptop = await device(browser);
  const phone = await device(browser, history({ '2026-10-22': { sessions: 2, minutes: 50 }, '2026-10-21': { sessions: 1, minutes: 25 } }));
  try {
    await pair(laptop.page, key);
    await pair(phone.page, key);

    // A work session finishes on the laptop and reaches the room by itself
    await laptop.page.getByRole('button', { name: /^start$/i }).click();
    await laptop.page.clock.fastForward(25 * 60_000);
    await expect(laptop.page.locator('.badge')).toHaveText('Break');
    await expect.poll(async () => Object.keys((await room(laptop.page, key)).stats).length).toBe(2);

    for (const { page } of [laptop, phone]) {
      await resync(page);
      await openStats(page);
      await expect(page.getByText('3 of 8 timers', { exact: true })).toBeVisible();
      await expect(page.getByText('2 days', { exact: true })).toBeVisible();
      await expect(page.getByText('Stats include your paired devices.')).toBeVisible();
    }
    expect(await laptop.page.evaluate(() => JSON.parse(localStorage.getItem('pomodoro_session_v2')!).focusStats))
      .toEqual({ '2026-10-22': { sessions: 1, minutes: 25 } });
  } finally {
    await laptop.context.close();
    await phone.context.close();
  }
});

test('a setting changed on one device reaches the other, and the newest change wins', async ({ browser }) => {
  const key = generateSyncKey();
  const laptop = await device(browser);
  const phone = await device(browser);
  try {
    await pair(laptop.page, key);
    await pair(phone.page, key);

    await laptop.page.getByLabel('Work duration slider in minutes').fill('30');
    await openStats(laptop.page);
    await laptop.page.getByRole('button', { name: 'Raise daily goal' }).click();
    await expect.poll(async () => (await room(laptop.page, key)).settings?.dailyGoal).toBe(9);

    await resync(phone.page);
    await expect(phone.page.getByLabel('Work duration slider in minutes')).toHaveValue('30');
    await expect(phone.page.getByText('30:00', { exact: true })).toBeVisible();
    await openStats(phone.page);
    await expect(phone.page.getByText('0 of 9 timers', { exact: true })).toBeVisible();

    // Ten minutes later on the phone, its change is the newest
    await phone.page.clock.fastForward(10 * 60_000);
    await phone.page.getByRole('button', { name: 'Lower daily goal' }).click();
    await phone.page.getByRole('button', { name: 'Lower daily goal' }).click();
    await expect.poll(async () => (await room(phone.page, key)).settings?.dailyGoal).toBe(7);
    await resync(laptop.page);
    await expect(laptop.page.getByText('0 of 7 timers', { exact: true })).toBeVisible();
    expect((await room(laptop.page, key)).settings?.workMinutes).toBe(30);
  } finally {
    await laptop.context.close();
    await phone.context.close();
  }
});

test('a device whose settings were never changed does not overwrite another device', async ({ browser }) => {
  const key = generateSyncKey();
  // The laptop's 40-minute work length predates settings sync, so it has no change time
  const laptop = await device(browser, { pomodoro_work_duration: '40' });
  const phone = await device(browser);
  try {
    await pair(laptop.page, key);
    await pair(phone.page, key);
    await resync(laptop.page);
    await resync(phone.page);
    await expect(laptop.page.getByLabel('Work duration slider in minutes')).toHaveValue('40');
    await expect(phone.page.getByLabel('Work duration slider in minutes')).toHaveValue('25');
    expect((await room(laptop.page, key)).settings).toBeNull();
  } finally {
    await laptop.context.close();
    await phone.context.close();
  }
});

test('rotating the key carries stats and settings; disconnecting shows this device only', async ({ browser }) => {
  const key = generateSyncKey();
  const laptop = await device(browser, history({ '2026-10-22': { sessions: 1, minutes: 25 } }));
  const phone = await device(browser, history({ '2026-10-22': { sessions: 2, minutes: 50 } }));
  try {
    await pair(laptop.page, key);
    await pair(phone.page, key);
    await openStats(laptop.page);
    await laptop.page.getByRole('button', { name: 'Raise daily goal' }).click();
    await expect.poll(async () => {
      const document = await room(laptop.page, key);
      return [Object.keys(document.stats).length, document.settings?.dailyGoal];
    }).toEqual([2, 9]);
    await resync(laptop.page);
    await expect(laptop.page.getByText('3 of 9 timers', { exact: true })).toBeVisible();

    // Sync settings open from the task list on the Timer tab
    await laptop.page.getByRole('button', { name: 'Timer', exact: true }).click();
    await laptop.page.getByRole('button', { name: /open sync settings/i }).click();
    await laptop.page.getByRole('button', { name: /rotate secure key/i }).click();
    const keyInput = laptop.page.getByLabel('Sync key', { exact: true });
    await expect(keyInput).not.toHaveValue(key);
    const rotated = await room(laptop.page, await keyInput.inputValue());
    expect(Object.values(rotated.stats).map((stats) => stats['2026-10-22']!.sessions).sort()).toEqual([1, 2]);
    expect(rotated.settings?.dailyGoal).toBe(9);

    await laptop.page.getByRole('button', { name: 'Disconnect' }).click();
    await laptop.page.locator('button[aria-label="Close sync modal"]').click();
    await openStats(laptop.page);
    await expect(laptop.page.getByText('1 of 9 timers', { exact: true })).toBeVisible();
    await expect(laptop.page.getByText('Stats are stored on this device only.')).toBeVisible();
  } finally {
    await laptop.context.close();
    await phone.context.close();
  }
});
