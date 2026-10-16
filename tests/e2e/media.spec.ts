import { expect, test } from '@playwright/test';

test('a source submitted before API readiness starts when the API becomes ready', async ({ page }) => {
  await page.route('https://www.youtube.com/iframe_api', (route) => route.abort());
  await page.goto('/');
  await page.locator('button[aria-label="Audio settings and YouTube URL loader"]').click();
  await page.locator('input[placeholder*="Paste YouTube"]').fill('jfKfPfyJRdk');
  await page.getByRole('button', { name: /load & play/i }).click();

  await page.evaluate(() => {
    (window as any).__playerCreated = 0;
    window.YT = {
      Player: function (_id: string, config: any) {
        (window as any).__playerCreated += 1;
        const player = {
          setVolume() {}, playVideo() {}, setLoop() {}, setShuffle() {},
          getPlaylist: () => [], getPlaylistIndex: () => -1,
        };
        setTimeout(() => config.events.onReady({ target: player }), 0);
        return player;
      },
    };
    window.onYouTubeIframeAPIReady();
  });

  await expect.poll(() => page.evaluate(() => (window as any).__playerCreated)).toBe(1);
});

test('saved queue entries never expose raw YouTube IDs as titles', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('pomodoro_music_queue', JSON.stringify([
      {
        id: 'legacy-video',
        title: 'YouTube Track: jfKfPfyJRdk',
        sourceType: 'youtube-video',
        youtubeId: 'jfKfPfyJRdk',
      },
    ]));
  });
  await page.reload();
  await expect(page.getByText('Saved YouTube track', { exact: true })).toBeVisible();
  await expect(page.getByText(/jfKfPfyJRdk/)).toHaveCount(0);
});
