import { expect, test } from '@playwright/test';

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
  const key = await page.locator('input[placeholder*="my-work-tasks"]').inputValue();
  expect(key).toMatch(/^pf-[a-z2-7]{26}$/);
  await expect(page.locator('input[readonly]')).toHaveValue(new RegExp(`#sync=${key}$`));

  await page.getByRole('button', { name: /show qr code/i }).click();
  const qr = page.getByAltText('QR code containing the Pomoflow pairing link');
  await expect(qr).toBeVisible();
  await expect(qr).toHaveAttribute('src', /^data:image\/png;base64,/);
});

test('rotating a key revokes the old sync room', async ({ page }) => {
  await page.getByRole('button', { name: /open sync settings/i }).click();
  await page.getByRole('button', { name: /generate secure key/i }).click();
  const oldKey = await page.locator('input[placeholder*="my-work-tasks"]').inputValue();
  await page.locator('button[aria-label="Close sync modal"]').click();
  await page.locator('input[placeholder*="Add a new task"]').fill('Rotation test task');
  await page.keyboard.press('Enter');
  await expect.poll(async () => {
    const response = await page.request.get('/api/tasks', { headers: { Authorization: `Bearer ${oldKey}` } });
    return (await response.json()).tasks.length;
  }).toBe(1);

  await page.getByRole('button', { name: /open sync settings/i }).click();
  await page.getByRole('button', { name: /rotate secure key/i }).click();
  const keyInput = page.locator('input[placeholder*="my-work-tasks"]');
  await expect(keyInput).not.toHaveValue(oldKey);
  const newKey = await keyInput.inputValue();
  expect(newKey).not.toBe(oldKey);

  const revoked = await page.request.get('/api/tasks', { headers: { Authorization: `Bearer ${oldKey}` } });
  expect((await revoked.json()).tasks).toEqual([]);
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
