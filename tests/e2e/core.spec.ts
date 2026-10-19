import { expect, test } from '@playwright/test';
import { decryptTasks, syncCredential } from '../../src/utils/sync';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('timer and task CRUD work', async ({ page }) => {
  await expect(page.getByText('25:00', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^start$/i }).click();
  await expect(page.getByRole('button', { name: /^pause$/i })).toBeVisible();
  await page.keyboard.press('Space');
  await page.keyboard.press('r');
  await expect(page.getByText('25:00', { exact: true })).toBeVisible();

  await page.locator('input[placeholder*="Add a new task"]').fill('Browser test task');
  await page.keyboard.press('Enter');
  await page.locator('button[aria-label=\'Mark "Browser test task" as completed\']').click();
  await expect(page.locator('button[aria-label=\'Mark "Browser test task" as incomplete\']')).toBeVisible();
  await page.locator('button[aria-label=\'Delete "Browser test task"\']').click();
  await expect(page.getByText('Browser test task', { exact: true })).toHaveCount(0);
});

test('stats start empty without manual or demo controls', async ({ page }) => {
  await page.getByRole('button', { name: /stats/i }).click();
  await expect(page.getByText(/No focus sessions yet/i)).toBeVisible();
  await expect(page.getByText(/Log \+1|Demo Data/i)).toHaveCount(0);
});

test('the jukebox stays off the Stats tab until music is loaded', async ({ page }) => {
  const player = page.locator('section[aria-label="Music player"]');
  await expect(player).toBeVisible();
  await page.getByRole('button', { name: 'Stats', exact: true }).click();
  await expect(page.getByText(/No focus sessions yet/i)).toBeVisible();
  await expect(player).toBeHidden();
  await page.getByRole('button', { name: 'Timer', exact: true }).click();
  await expect(player).toBeVisible();
});

test('a labelled Load button opens the YouTube panel', async ({ page }) => {
  const player = page.locator('section[aria-label="Music player"]');
  await expect(player.locator('.titlebar button')).toHaveCount(0);
  await expect(player.getByText('Press Load to add one.')).toBeVisible();
  const load = player.getByRole('button', { name: 'Load from YouTube' });
  await expect(load).toHaveText('Load');
  await load.click();
  await expect(load).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('YouTube URL, video ID or playlist URL')).toBeVisible();
});

test('the task list keeps a fixed height and scrolls', async ({ page }) => {
  const list = page.locator('.task-scroll');
  // Fonts change line heights, so measure once they have loaded
  const heights = () => page.evaluate(async () => {
    await document.fonts.ready;
    return {
      list: document.querySelector('.task-scroll')!.clientHeight,
      window: document.querySelector('main')!.getBoundingClientRect().height,
    };
  });
  const rowInsideList = (which: 'first' | 'last', selector = '.list-row') => list.evaluate((element, [which, selector]) => {
    const rows = element.querySelectorAll(selector);
    const row = (which === 'first' ? rows[0] : rows[rows.length - 1])!;
    const outer = element.getBoundingClientRect();
    const inner = row.getBoundingClientRect();
    // 1px allows for sub-pixel scroll positions
    return inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1;
  }, [which, selector] as const);

  const empty = await heights();
  await page.evaluate(() => localStorage.setItem('pomodoro_tasks', JSON.stringify(Array.from({ length: 20 }, (_, i) => ({
    id: `seed-${i}`, title: `Seeded task ${i + 1}`, completed: i >= 15, createdAt: 20 - i, updatedAt: 20 - i,
  })))));
  await page.reload();
  await expect(page.getByText('Seeded task 1', { exact: true })).toBeVisible();
  expect(await heights()).toEqual(empty);
  expect(await list.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  expect(await rowInsideList('first')).toBe(true);
  expect(await rowInsideList('last')).toBe(false);

  await list.evaluate(element => { element.scrollTop = element.scrollHeight; });
  expect(await rowInsideList('first')).toBe(false);
  expect(await rowInsideList('last')).toBe(true);
  await page.getByRole('button', { name: 'Edit "Seeded task 15"' }).click();
  await expect(page.getByLabel('Edit task title')).toBeFocused();
  expect(await rowInsideList('last', '.list-row:has(input[name="edit-task-title"])')).toBe(true);
  await page.keyboard.press('Escape');

  await page.locator('input[placeholder*="Add a new task"]').fill('Newest task');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Newest task', { exact: true })).toBeVisible();
  expect(await rowInsideList('first')).toBe(true);
  expect(await heights()).toEqual(empty);
});

test('system theme follows the OS and cycles through explicit modes', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();
  const themeButton = page.getByRole('button', { name: /Theme: system/i });
  await expect(themeButton).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/dark/);

  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).not.toHaveClass(/dark/);

  await themeButton.click();
  await expect(page.getByRole('button', { name: /Theme: light/i })).toBeVisible();
  await expect(page.locator('html')).not.toHaveClass(/dark/);

  await page.getByRole('button', { name: /Theme: light/i }).click();
  await expect(page.getByRole('button', { name: /Theme: dark/i })).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/dark/);

  await page.getByRole('button', { name: /Theme: dark/i }).click();
  await expect(page.getByRole('button', { name: /Theme: system/i })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('pomodoro_theme'))).toBe('system');
});

test('pairing creates a fragment link and local QR code', async ({ page }) => {
  await page.getByRole('button', { name: /open sync settings/i }).click();
  await page.getByRole('button', { name: /generate secure key/i }).click();
  await expect(page.getByLabel('Sync key', { exact: true })).toHaveValue(/^pf2-[a-z2-7]{26}$/);
  const key = await page.getByLabel('Sync key', { exact: true }).inputValue();
  expect(key).toMatch(/^pf2-[a-z2-7]{26}$/);
  await expect(page.locator('input[readonly]')).toHaveValue(new RegExp(`#sync=${key}$`));

  await page.getByRole('button', { name: /show qr code/i }).click();
  const qr = page.getByAltText('QR code containing the Pomoflow pairing link');
  await expect(qr).toBeVisible();
  await expect(qr).toHaveAttribute('src', /^data:image\/png;base64,/);
});

test('pasting a pairing link into the key field connects to its key', async ({ page }) => {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  const key = `pf2-${Array.from({ length: 26 }, () => alphabet[Math.floor(Math.random() * 32)]).join('')}`;
  await page.getByRole('button', { name: /open sync settings/i }).click();
  const keyInput = page.getByLabel('Sync key', { exact: true });

  await keyInput.fill('https://pomoflow.pages.dev/#sync=');
  await page.getByRole('button', { name: /^connect$/i }).click();
  await expect(page.getByRole('alert')).toContainText('Key must be');

  await keyInput.fill(`https://pomoflow.pages.dev/#sync=${key.toUpperCase()}`);
  await page.getByRole('button', { name: /^connect$/i }).click();
  await page.getByRole('button', { name: 'Use room tasks only' }).click();
  await expect(keyInput).toHaveValue(key);
  await expect(page.getByLabel('Pairing link')).toHaveValue(new RegExp(`#sync=${key}$`));
  await expect.poll(() => page.evaluate(() => localStorage.getItem('pomodoro_sync_key'))).toBe(key);
});

test('unpaired sync status stays inside its box', async ({ page }) => {
  await page.getByRole('button', { name: /open sync settings/i }).click();
  const status = page.getByText('Not paired. Tasks stay on this device.');
  const text = await status.boundingBox();
  const box = await status.locator('xpath=ancestor::div[contains(@class, "border-2")][1]').boundingBox();
  expect(text!.x + text!.width).toBeLessThanOrEqual(box!.x + box!.width);
});

test('rotating a key revokes the old sync room', async ({ page }) => {
  await page.getByRole('button', { name: /open sync settings/i }).click();
  await page.getByRole('button', { name: /generate secure key/i }).click();
  await expect(page.getByLabel('Sync key', { exact: true })).toHaveValue(/^pf2-[a-z2-7]{26}$/);
  const oldKey = await page.getByLabel('Sync key', { exact: true }).inputValue();
  const oldCredential = await syncCredential(oldKey);
  await page.locator('button[aria-label="Close sync modal"]').click();
  await page.locator('input[placeholder*="Add a new task"]').fill('Rotation test task');
  await page.keyboard.press('Enter');
  await expect.poll(async () => {
    const response = await page.request.get('/api/tasks', { headers: { Authorization: `Bearer ${oldCredential}` } });
    return (await decryptTasks(oldKey, (await response.json()).encrypted)).length;
  }).toBe(1);

  await page.getByRole('button', { name: /open sync settings/i }).click();
  await page.getByRole('button', { name: /rotate secure key/i }).click();
  const keyInput = page.getByLabel('Sync key', { exact: true });
  await expect(keyInput).not.toHaveValue(oldKey);
  const newKey = await keyInput.inputValue();
  expect(newKey).not.toBe(oldKey);

  const revoked = await page.request.get('/api/tasks', { headers: { Authorization: `Bearer ${oldCredential}` } });
  expect(revoked.status()).toBe(410);
});

test('malformed persisted data recovers without blanking the app', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('pomodoro_work_duration', 'garbage');
    localStorage.setItem('pomodoro_tasks', '{}');
    localStorage.setItem('pomodoro_music_queue', '{}');
  });
  await page.reload();
  await expect(page.getByText('25:00', { exact: true })).toBeVisible();
  await page.locator('button[aria-label="Toggle playlist and queue"]').click();
  await expect(page.getByText('Current Playlist & Queue (0)')).toBeVisible();
});
