import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

// Thursday 22 October 2026. Each older day falls in exactly one wider period.
const HISTORY = {
  '2026-10-22': { sessions: 3, minutes: 75 },
  '2026-10-21': { sessions: 2, minutes: 50 },
  '2026-10-20': { sessions: 1, minutes: 25 },
  '2026-10-10': { sessions: 4, minutes: 100 },
  '2026-03-05': { sessions: 6, minutes: 150 },
  '2025-09-01': { sessions: 9, minutes: 225 },
};

async function openStats(page: Page, history: object = HISTORY) {
  await page.clock.install({ time: new Date('2026-10-22T09:00:00') });
  await page.goto('/');
  await page.evaluate((stats) => localStorage.setItem('pomodoro_focus_stats_v2', JSON.stringify(stats)), history);
  await page.reload();
  await page.getByRole('button', { name: 'Stats', exact: true }).click();
}

test('today shows progress toward a daily goal that is remembered, and the streak', async ({ page }) => {
  await openStats(page);
  await expect(page.getByText('3 of 8 timers', { exact: true })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Daily goal' })).toHaveAttribute('aria-valuenow', '3');
  await expect(page.getByText('3 days', { exact: true })).toBeVisible();
  await expect(page.getByText('Goal met.')).toHaveCount(0);

  await page.getByRole('button', { name: 'Raise daily goal' }).click();
  await expect(page.getByText('3 of 9 timers', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Stats', exact: true }).click();
  await expect(page.getByText('3 of 9 timers', { exact: true })).toBeVisible();

  for (let step = 0; step < 6; step++) await page.getByRole('button', { name: 'Lower daily goal' }).click();
  await expect(page.getByText('3 of 3 timers', { exact: true })).toBeVisible();
  await expect(page.getByText('Goal met.')).toBeVisible();
});

test('week, month and year show their own totals', async ({ page }) => {
  await openStats(page);
  const summary = page.locator('dl');
  await expect(page.getByRole('heading', { name: 'Last 7 days' })).toBeVisible();
  await expect(summary).toHaveText(/Timers\s*6\s*Focus time\s*2h 30m\s*Daily average\s*21m\s*Best day\s*Thu, 1h 15m/);

  await page.getByRole('button', { name: 'Month', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Month', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Last 30 days' })).toBeVisible();
  await expect(summary).toHaveText(/Timers\s*10\s*Focus time\s*4h 10m\s*Daily average\s*8m\s*Best day\s*Oct 10, 1h 40m/);

  await page.getByRole('button', { name: 'Year', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Last 12 months' })).toBeVisible();
  await expect(summary).toHaveText(/Timers\s*16\s*Focus time\s*6h 40m\s*Monthly average\s*33m\s*Best month\s*Oct 2026, 4h 10m/);
  await expect(page.getByText('Minutes per month')).toBeVisible();
});

test('Export CSV downloads every recorded day', async ({ page }) => {
  await openStats(page);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('pomoflow-stats-2026-10-22.csv');
  expect(await readFile((await file.path())!, 'utf8')).toBe([
    'date,timers,focus_minutes',
    '2025-09-01,9,225',
    '2026-03-05,6,150',
    '2026-10-10,4,100',
    '2026-10-20,1,25',
    '2026-10-21,2,50',
    '2026-10-22,3,75',
    '',
  ].join('\n'));
});

test('with no history, export is off and the streak is zero', async ({ page }) => {
  await openStats(page, {});
  await expect(page.getByText(/No focus sessions yet/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
  await expect(page.getByText('0 of 8 timers', { exact: true })).toBeVisible();
  await expect(page.getByText('0 days', { exact: true })).toBeVisible();
});
