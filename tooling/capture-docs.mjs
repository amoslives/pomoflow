// Run against `npm run dev`; requires ImageMagick for the animated walkthrough.
import { chromium } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const temporary = await mkdtemp(join(tmpdir(), 'pomoflow-capture-'));
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 1180 }, colorScheme: 'light' });
  // Headless Chromium denies notifications, which the timer would report once Start is pressed
  await page.addInitScript(() => {
    Object.defineProperty(Notification, 'permission', { configurable: true, get: () => 'granted' });
  });
  let encrypted = null;
  let revision = 0;
  await page.route('**/api/tasks', async route => {
    if (route.request().method() === 'POST') {
      encrypted = route.request().postDataJSON().encrypted; revision++;
    }
    await route.fulfill({ json: { encrypted, revision, success: true } });
  });
  await page.goto(process.env.CAPTURE_URL || 'http://127.0.0.1:3000');
  await page.evaluate(() => {
    localStorage.clear();
    const titles = ['Write the Show HN post', 'Reply to code review', 'Fix README screenshots'];
    localStorage.setItem('pomodoro_tasks', JSON.stringify(titles.map((title, i) => ({
      id: `demo-${i}`, title, completed: i === 2, createdAt: 3 - i, updatedAt: 3 - i,
    }))));
    const stats = {};
    for (let i = 0; i < 7; i++) {
      const date = new Date(); date.setDate(date.getDate() - i);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      stats[key] = { sessions: i, minutes: i * 25 };
    }
    localStorage.setItem('pomodoro_focus_stats_v2', JSON.stringify(stats));
    localStorage.setItem('pomodoro_completed_sessions', '21');
  });
  await page.reload();
  await page.evaluate(() => document.fonts.ready);
  const frames = [];
  const frame = async () => {
    const filename = join(temporary, `${frames.length}.png`);
    await page.screenshot({ path: filename }); frames.push(filename);
  };
  await page.screenshot({ path: 'docs/screenshot-light.png' });
  await frame();
  await page.getByRole('button', { name: /^start$/i }).click();
  await frame();
  await page.getByRole('button', { name: /^pause$/i }).click();
  await page.getByRole('button', { name: 'Load from YouTube' }).click();
  await frame();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Stats', exact: true }).click();
  await page.getByText('8h 45m', { exact: true }).waitFor();
  await page.screenshot({ path: 'docs/screenshot-stats.png' });
  await frame();
  await page.getByRole('button', { name: 'Timer', exact: true }).click();
  await page.getByRole('button', { name: /Theme: system/i }).click();
  await page.getByRole('button', { name: /Theme: light/i }).click();
  await page.screenshot({ path: 'docs/screenshot-dark.png' });
  await frame();
  await page.getByRole('button', { name: /open sync settings/i }).click();
  await page.getByRole('button', { name: 'Generate secure key' }).click();
  await page.getByRole('button', { name: 'Show QR code' }).click();
  await page.getByAltText('QR code containing the Pomoflow pairing link').waitFor();
  await frame();
  execFileSync('magick', ['-delay', '180', ...frames, '-loop', '0', '-layers', 'Optimize', 'docs/demo.gif']);

  await page.getByRole('button', { name: 'Close sync modal' }).click();
  await page.getByRole('button', { name: /Theme: dark/i }).click();
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.evaluate(() => {
    const main = document.querySelector('main');
    Object.assign(main.style, { position: 'absolute', left: '600px', top: '85px', width: '560px' });
    document.querySelector('[aria-label="Music player"]').remove();
    document.querySelector('footer').remove();
    const hero = document.createElement('div');
    hero.className = 'window window-body';
    Object.assign(hero.style, { position: 'absolute', left: '50px', top: '110px', width: '530px', padding: '32px' });
    const title = document.createElement('h2');
    title.textContent = 'Pomoflow'; title.style.cssText = 'font-size:56px;line-height:1;margin-bottom:16px;font-weight:bold';
    hero.append(title);
    for (const line of ['A one-bit Pomodoro timer.', '□ No account needed', '□ Encrypted task sync by QR', '□ Optional YouTube player', '□ Open source, Apache 2.0']) {
      const text = document.createElement('p'); text.textContent = line; text.style.cssText = 'font-size:24px;margin:8px 0'; hero.append(text);
    }
    document.body.append(hero);
  });
  await page.screenshot({ path: 'public/og-image.png' });
} finally {
  await browser.close();
  await rm(temporary, { recursive: true, force: true });
}
