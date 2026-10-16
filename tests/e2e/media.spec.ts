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

test('refresh restores the active track and playback position without autoplay', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__fakeTime = 0;
    window.YT = {
      get: () => (window as any).__fakePlayer,
      Player: function (_id: string, config: any) {
        (window as any).__fakeTime = Number(config.playerVars?.start || 0);
        const player = {
          setVolume() {}, setLoop() {}, setShuffle() {}, pauseVideo() {}, stopVideo() {}, destroy() {},
          getCurrentTime: () => (window as any).__fakeTime,
          getDuration: () => 120,
          getVideoData: () => ({ title: 'Restorable test video', isLive: false }),
          getPlaylist: () => [], getPlaylistIndex: () => -1, getPlayerState: () => 2,
          seekTo: (seconds: number) => { (window as any).__fakeTime = seconds; },
          playVideo: () => config.events.onStateChange({ data: 1, target: player }),
          loadVideoById: () => {},
        };
        (window as any).__fakePlayer = player;
        setTimeout(() => config.events.onReady({ target: player }), 0);
        return player;
      },
    };
  });

  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('button[aria-label="Audio settings and YouTube URL loader"]').click();
  await page.locator('input[placeholder*="Paste YouTube"]').fill('jfKfPfyJRdk');
  await page.getByRole('button', { name: /load & play/i }).click();
  await expect(page.locator('button[aria-label="Pause music"]')).toBeVisible();
  await page.evaluate(() => { (window as any).__fakeTime = 42; });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('pomodoro_music_playback') || 'null')?.position)).toBe(42);

  await page.reload();
  await expect(page.locator('button[aria-label="Play music"]')).toBeVisible();
  await expect(page.locator('input[aria-label="Seek through current track"]')).toHaveValue('42');
  await expect(page.locator('button[aria-label="Pause music"]')).toHaveCount(0);
});
