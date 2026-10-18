import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://www.youtube.com/oembed**', route => route.fulfill({ json: { title: 'Test video', author_name: 'Test' } }));
  await page.addInitScript(() => {
    const calls: unknown[][] = [];
    (window as any).__mediaCalls = calls;
    window.YT = {
      Player: function (element: HTMLElement, config: any) {
        let video = config.videoId || 'playlist-first';
        let playlist = config.playerVars.list ? ['playlist-first', 'playlist-next'] : [];
        let index = playlist.length ? 0 : -1;
        let time = config.playerVars.start || 0;
        const frame = document.createElement('iframe');
        frame.width = config.width; frame.height = config.height;
        frame.title = 'YouTube video player'; element.replaceWith(frame);
        (window as any).__mediaConfig = config;
        const emit = (data: number) => config.events.onStateChange({ data, target: player });
        const player = {
          setVolume() {}, setLoop() {}, setShuffle() {}, mute() {}, unMute() {},
          getDuration: () => 120, getCurrentTime: () => time, getPlayerState: () => 2,
          getVideoData: () => ({ title: video, isLive: false }),
          getPlaylist: () => playlist, getPlaylistIndex: () => index,
          playVideo() { calls.push(['play', video]); emit(1); },
          pauseVideo() { emit(2); }, stopVideo() { emit(2); },
          seekTo(seconds: number) { time = seconds; calls.push(['seek', seconds]); },
          nextVideo() { index++; video = playlist[index] || ''; calls.push(['nextVideo']); emit(1); },
          previousVideo() {}, playVideoAt(i: number) { index = i; },
          loadVideoById(value: any) { video = value.videoId; time = value.startSeconds; playlist = []; calls.push(['load', video]); emit(1); },
          cueVideoById(value: any) { video = value.videoId; time = value.startSeconds; playlist = []; calls.push(['cue', video]); emit(5); },
          loadPlaylist(value: any) { playlist = ['playlist-first', 'playlist-next']; index = 0; video = playlist[0]!; time = value.startSeconds; emit(1); },
          cuePlaylist(value: any) { this.loadPlaylist(value); emit(5); },
          destroy() { frame.remove(); },
        };
        (window as any).__mediaEmit = emit;
        (window as any).__mediaError = () => config.events.onError({ data: 100, target: player });
        setTimeout(() => config.events.onReady({ target: player }), 0);
        return player;
      },
    };
  });
  await page.goto('/');
});

test('removed current source is replaced and Play cannot resume the removed video', async ({ page }) => {
  for (const id of ['aaaaaaaaaaa', 'bbbbbbbbbbb']) {
    await page.getByRole('button', { name: 'Audio settings and YouTube URL loader' }).click();
    await page.getByLabel('YouTube URL, video ID or playlist URL').fill(id);
    await page.getByLabel('Custom label for this source').fill(id === 'aaaaaaaaaaa' ? 'First' : 'Second');
    await page.getByRole('button', { name: 'Load & play' }).click();
  }
  await page.getByRole('button', { name: 'Toggle playlist and queue' }).click();
  await page.getByRole('button', { name: 'Remove Second' }).click();
  await page.getByRole('button', { name: 'Play music', exact: true }).click();
  expect(await page.evaluate(() => (window as any).__mediaCalls.filter((call: string[]) => call[0] === 'play').at(-1))).toEqual(['play', 'aaaaaaaaaaa']);
  await expect(page.locator('section[aria-label="Music player"] [aria-live="polite"]')).not.toContainText('bbbbbbbbbbb');
  await page.getByRole('button', { name: 'Remove First' }).click();
  await expect(page.locator('section[aria-label="Music player"] [aria-live="polite"]')).toContainText('No track loaded');
});

test('reused player handles playlist errors and repeat-one using the active source', async ({ page }) => {
  for (const source of ['aaaaaaaaaaa', 'PLabcdefghijklm']) {
    await page.getByRole('button', { name: 'Audio settings and YouTube URL loader' }).click();
    await page.getByLabel('YouTube URL, video ID or playlist URL').fill(source);
    await page.getByRole('button', { name: 'Load & play' }).click();
  }
  await page.evaluate(() => (window as any).__mediaError());
  expect(await page.evaluate(() => (window as any).__mediaCalls.filter((call: string[]) => call[0] === 'nextVideo').length)).toBe(1);
  await page.getByRole('button', { name: 'Repeat mode: all' }).click();
  await page.evaluate(() => (window as any).__mediaEmit(0));
  expect(await page.evaluate(() => (window as any).__mediaCalls.slice(-2))).toEqual([['seek', 0], ['play', 'playlist-next']]);
});

test('shuffle history survives insertion at the start of the queue', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('pomodoro_music_queue', JSON.stringify(['a', 'b', 'c'].map(id => ({
      id, title: id.toUpperCase(), sourceType: 'youtube-video', youtubeId: id.repeat(11),
    }))));
  });
  await page.reload();
  await page.evaluate(() => { Math.random = () => 0; });
  await page.getByRole('button', { name: 'Play music', exact: true }).click();
  await page.getByRole('button', { name: 'Enable shuffle mode' }).click();
  await page.getByRole('button', { name: 'Next track', exact: true }).click();
  await page.getByRole('button', { name: 'Audio settings and YouTube URL loader' }).click();
  await page.getByLabel('YouTube URL, video ID or playlist URL').fill('ddddddddddd');
  await page.getByRole('button', { name: 'Load & play' }).click();
  await page.getByRole('button', { name: 'Next track', exact: true }).click();
  await expect(page.locator('section[aria-label="Music player"] [aria-live="polite"]')).toContainText('ccccccccccc');
});

test('player has a visible viewport and privacy-enhanced host', async ({ page }) => {
  await page.getByRole('button', { name: 'Audio settings and YouTube URL loader' }).click();
  await page.getByLabel('YouTube URL, video ID or playlist URL').fill('aaaaaaaaaaa');
  await page.getByRole('button', { name: 'Load & play' }).click();
  const frame = page.locator('#youtube-player-host iframe');
  await expect(frame).toBeVisible();
  const box = await frame.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(200);
  expect(box!.height).toBeGreaterThanOrEqual(200);
  expect(await page.evaluate(() => (window as any).__mediaConfig.host)).toBe('https://www.youtube-nocookie.com');
});

test('cued events use the new source position instead of the restored first position', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('pomodoro_music_queue', JSON.stringify([
      { id: 'first', title: 'First', sourceType: 'youtube-video', youtubeId: 'aaaaaaaaaaa' },
    ]));
    localStorage.setItem('pomodoro_music_playback', JSON.stringify({ trackId: 'first', position: 42, playlistIndex: -1 }));
  });
  await page.reload();
  await page.getByRole('button', { name: 'Play music', exact: true }).click();
  await page.getByRole('button', { name: 'Audio settings and YouTube URL loader' }).click();
  await page.getByLabel('YouTube URL, video ID or playlist URL').fill('bbbbbbbbbbb');
  await page.getByRole('button', { name: 'Load & play' }).click();
  await page.evaluate(() => (window as any).__mediaEmit(5));
  await expect(page.getByLabel('Seek through current track')).toHaveValue('0');
});

test('YouTube playback pauses when the document is hidden', async ({ page }) => {
  await page.getByRole('button', { name: 'Audio settings and YouTube URL loader' }).click();
  await page.getByLabel('YouTube URL, video ID or playlist URL').fill('aaaaaaaaaaa');
  await page.getByRole('button', { name: 'Load & play' }).click();
  await expect(page.getByRole('button', { name: 'Pause music', exact: true })).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByRole('button', { name: 'Play music', exact: true })).toBeVisible();
});
