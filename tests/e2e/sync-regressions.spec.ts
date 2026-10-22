import { expect, test } from '@playwright/test';
import { decryptTasks, encryptDocument, generateSyncKey, syncCredential } from '../../src/utils/sync';
import { createTask } from '../../src/utils/tasks';

test('opening a pairing link never uploads local tasks without confirmation', async ({ page }) => {
  await page.goto('/');
  await page.locator('[name="new-task"]').fill('Private local task');
  await page.getByRole('button', { name: 'Add task', exact: true }).click();
  const key = generateSyncKey();
  const credential = await syncCredential(key);
  const writes: string[] = [];
  page.on('request', request => {
    if (request.url().endsWith('/api/tasks') && request.method() === 'POST') writes.push(request.postData() || '');
  });
  await page.goto(`/#sync=${key}`);
  await expect(page.getByRole('dialog', { name: 'Pair with this task list?' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('pomodoro_sync_key'))).toBeNull();
  expect(writes).toEqual([]);
  await page.getByRole('button', { name: 'Use room tasks only' }).click();
  await expect(page.locator('[name="new-task"]')).toBeVisible();
  await expect(page.getByText('Private local task', { exact: true })).toHaveCount(0);
  expect(writes).toEqual([]);
  const remote = await page.request.get('/api/tasks', { headers: { Authorization: `Bearer ${credential}` } });
  expect(await decryptTasks(key, (await remote.json()).encrypted)).toEqual([]);
  expect(await page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('pomodoro_pairing_backup_')))).toBe(true);
});

test('two devices keep remote deletions and offline additions without leaking plaintext', async ({ browser }) => {
  const key = generateSyncKey();
  const credential = await syncCredential(key);
  const task = { ...createTask('Original task'), id: 'original' };
  const first = await browser.newContext();
  const second = await browser.newContext();
  try {
    const a = await first.newPage(), b = await second.newPage();
    const response = await a.request.post('http://127.0.0.1:3000/api/tasks', {
      headers: { Authorization: `Bearer ${credential}` },
      data: { encrypted: await encryptDocument(key, { tasks: [task], stats: {}, settings: null }), baseRevision: 0 },
    });
    expect(response.ok()).toBe(true);
    for (const page of [a, b]) {
      await page.goto(`http://127.0.0.1:3000/#sync=${key}`);
      await page.getByRole('button', { name: 'Use room tasks only' }).click();
      await expect(page.getByText('Original task', { exact: true })).toBeVisible();
    }
    await second.setOffline(true);
    await b.locator('[name="new-task"]').fill('Created offline');
    await b.getByRole('button', { name: 'Add task', exact: true }).click();
    await a.getByRole('button', { name: 'Delete "Original task"', exact: true }).click();
    await expect(a.getByRole('button', { name: /Open sync settings: Synced/i })).toBeVisible();
    await second.setOffline(false);
    await b.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(b.getByText('Original task', { exact: true })).toHaveCount(0);
    await expect(b.getByRole('button', { name: /Open sync settings: Synced/i })).toBeVisible();
    await a.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(a.getByText('Created offline', { exact: true })).toBeVisible();
    const wire = await a.request.get('http://127.0.0.1:3000/api/tasks', { headers: { Authorization: `Bearer ${credential}` } });
    const text = await wire.text();
    expect(text).not.toContain('Created offline');
    expect((await decryptTasks(key, JSON.parse(text).encrypted)).map(t => t.title)).toEqual(['Created offline']);
  } finally { await first.close(); await second.close(); }
});

test('a revoked device stops syncing and cannot republish its local copy', async ({ page }) => {
  const key = generateSyncKey();
  const credential = await syncCredential(key);
  await page.goto(`/#sync=${key}`);
  await page.getByRole('button', { name: 'Use room tasks only' }).click();
  await page.locator('[name="new-task"]').fill('Keep on this device');
  await page.getByRole('button', { name: 'Add task', exact: true }).click();
  await expect(page.getByRole('button', { name: /Open sync settings: Synced/i })).toBeVisible();
  expect((await page.request.delete('/api/tasks', { headers: { Authorization: `Bearer ${credential}` } })).ok()).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('alert')).toContainText('revoked');
  await expect(page.getByText('Keep on this device', { exact: true })).toBeVisible();
  expect((await page.request.get('/api/tasks', { headers: { Authorization: `Bearer ${credential}` } })).status()).toBe(410);
});

test('a restored overlong title recovers after deletion', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('pomodoro_tasks', JSON.stringify([
    { id: 'bad', title: 'x'.repeat(501), createdAt: 1, updatedAt: 1, completed: false },
  ])));
  await page.reload();
  await page.getByRole('button', { name: /open sync settings/i }).click();
  await page.getByRole('button', { name: 'Generate secure key' }).click();
  await expect(page.getByRole('dialog')).toContainText('Shorten task titles');
  await page.getByRole('button', { name: 'Close sync modal' }).click();
  await page.getByRole('button', { name: /^Delete "/ }).click();
  await page.getByRole('button', { name: /open sync settings/i }).click();
  await page.getByRole('button', { name: 'Generate secure key' }).click();
  await expect(page.getByLabel('Pairing link')).toBeVisible();
});

test('a late acknowledgement cannot switch back to the previous room', async ({ page }) => {
  await page.addInitScript(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (args[1]?.method === 'POST' && (window as any).__holdAcknowledgement) {
        (window as any).__holdAcknowledgement = false;
        const originalJson = response.json.bind(response);
        response.json = () => new Promise(resolve => {
          (window as any).__releaseAcknowledgement = () => resolve(originalJson());
        });
      }
      return response;
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: /open sync settings/i }).click();
  await page.getByRole('button', { name: 'Generate secure key' }).click();
  await expect(page.getByLabel('Pairing link')).toBeVisible();
  await page.getByRole('button', { name: 'Close sync modal' }).click();
  await page.evaluate(() => { (window as any).__holdAcknowledgement = true; });
  await page.locator('[name="new-task"]').fill('Previous room task');
  await page.getByRole('button', { name: 'Add task', exact: true }).click();
  await expect.poll(() => page.evaluate(() => typeof (window as any).__releaseAcknowledgement)).toBe('function');
  const newKey = generateSyncKey();
  await page.evaluate(key => { window.location.hash = `sync=${key}`; }, newKey);
  await page.getByRole('button', { name: 'Use room tasks only' }).click();
  await expect(page.getByText('Previous room task', { exact: true })).toHaveCount(0);
  await page.evaluate(() => (window as any).__releaseAcknowledgement());
  await expect(page.getByRole('button', { name: /Open sync settings: Synced/i })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('pomodoro_sync_key'))).toBe(newKey);
  await expect(page.getByText('Previous room task', { exact: true })).toHaveCount(0);
});
