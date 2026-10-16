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

test('pairing creates a fragment link and local QR code', async ({ page }) => {
  await page.getByText('CLOUDFLARE SYNC', { exact: false }).first().click();
  await page.getByRole('button', { name: /generate random key/i }).click();
  const key = await page.locator('input[placeholder*="my-work-tasks"]').inputValue();
  expect(key).toMatch(/^pf-[a-z2-7]{26}$/);
  await expect(page.locator('input[readonly]')).toHaveValue(new RegExp(`#sync=${key}$`));

  await page.getByRole('button', { name: /show qr code/i }).click();
  const qr = page.getByAltText('QR code containing the Pomoflow pairing link');
  await expect(qr).toBeVisible();
  await expect(qr).toHaveAttribute('src', /^data:image\/png;base64,/);
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
