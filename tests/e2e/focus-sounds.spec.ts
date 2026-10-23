import { expect, test, type Page } from '@playwright/test';

// Records what the focus sound engine does: looping sources started and stopped, and volume changes
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const log: string[] = [];
    (window as any).__focusLog = log;
    const Context = window.AudioContext;
    window.AudioContext = class extends Context {
      constructor(options?: AudioContextOptions) { super(options); (window as any).__audioContext = this; }
    };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof start>) {
      if (this.loop) log.push(`start ${this.buffer!.numberOfChannels} channels ${Math.round(this.buffer!.duration)} s`);
      return start.apply(this, args);
    };
    const stop = AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.stop = function (...args: Parameters<typeof stop>) {
      if (this.loop) log.push('stop');
      return stop.apply(this, args);
    };
    const setTarget = AudioParam.prototype.setTargetAtTime;
    AudioParam.prototype.setTargetAtTime = function (value: number, ...rest: [number, number]) {
      log.push(`volume ${value}`);
      return setTarget.call(this, value, ...rest);
    };
  });
});

const player = (page: Page) => page.locator('section[aria-label="Music player"]');
const nowPlaying = (page: Page) => player(page).locator('[aria-live="polite"]');
const focusLog = (page: Page) => page.evaluate(() => (window as any).__focusLog as string[]);

async function openFocusSounds(page: Page) {
  await page.getByRole('button', { name: 'Toggle playlist and queue' }).click();
  await page.getByRole('button', { name: 'Expand Focus sounds' }).click();
}

// The YouTube player stand-in from media-regressions.spec.ts, reduced to what these tests use
async function fakeYouTube(page: Page) {
  await page.route('https://www.youtube.com/oembed**', route => route.fulfill({ json: { title: 'Test video', author_name: 'Test' } }));
  await page.addInitScript(() => {
    const calls: unknown[][] = [];
    (window as any).__mediaCalls = calls;
    window.YT = {
      Player: function (element: HTMLElement, config: any) {
        let video = config.videoId;
        let time = 0;
        let state = -1;
        const frame = document.createElement('iframe');
        element.replaceWith(frame);
        const emit = (data: number) => { state = data; config.events.onStateChange({ data, target: player }); };
        const player = {
          setVolume() {}, setLoop() {}, setShuffle() {}, mute() {}, unMute() {},
          getDuration: () => 120, getCurrentTime: () => time, getPlayerState: () => state,
          getVideoData: () => ({ title: video, isLive: false }),
          getPlaylist: () => [], getPlaylistIndex: () => -1,
          playVideo() { calls.push(['play', video]); emit(1); },
          pauseVideo() { calls.push(['pause', video]); emit(2); },
          stopVideo() { emit(2); },
          seekTo(seconds: number) { time = seconds; },
          loadVideoById(value: any) { video = value.videoId; time = value.startSeconds; calls.push(['load', video]); emit(1); },
          cueVideoById(value: any) { video = value.videoId; time = value.startSeconds; emit(5); },
          destroy() { frame.remove(); },
        };
        (window as any).__mediaEmit = emit;
        (window as any).__mediaSetTime = (seconds: number) => { time = seconds; };
        (window as any).__mediaPosition = () => ({ video, time });
        setTimeout(() => config.events.onReady({ target: player }), 0);
        return player;
      },
    };
  });
}

async function playYouTube(page: Page) {
  await page.getByRole('button', { name: 'Load from YouTube' }).click();
  await page.getByLabel('YouTube URL, video ID or playlist URL').fill('aaaaaaaaaaa');
  await page.getByLabel('Custom label for this source').fill('Lofi');
  await page.getByRole('button', { name: 'Load & play' }).click();
  await expect(player(page).getByRole('button', { name: 'Pause music', exact: true })).toBeVisible();
}

test('focus sounds play from the queue without contacting YouTube', async ({ page }) => {
  const youtube: string[] = [];
  page.on('request', request => { if (/youtube|ytimg/.test(new URL(request.url()).hostname)) youtube.push(request.url()); });
  await page.goto('/');

  await page.getByRole('button', { name: 'Toggle playlist and queue' }).click();
  await expect(page.getByText('The queue is empty. Press Load to add a video or playlist.')).toBeVisible();
  await expect(page.getByText('Current Playlist & Queue (0)', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Expand Focus sounds' }).click();
  const sounds = page.getByRole('button', { name: /^Play focus sound/ });
  await expect(sounds).toHaveText([/Rain/, /Ocean waves/, /White noise/, /Pink noise/, /Brown noise/]);

  await page.getByRole('button', { name: 'Play focus sound 1: Rain' }).click();
  await expect(nowPlaying(page)).toHaveText('PlayingRain');
  expect(await focusLog(page)).toEqual(['start 2 channels 30 s']);
  await expect(page.getByLabel('Focus sounds play without end and are not seekable')).toBeDisabled();
  await expect(player(page).getByText('--:--')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Show video' })).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem('pomodoro_focus_sound'))).toBe('rain');

  await page.getByRole('button', { name: 'Next track', exact: true }).click();
  await expect(nowPlaying(page)).toHaveText('PlayingOcean waves');
  // Repeat all is the default, so Previous from the first sound goes round to the last
  await page.getByRole('button', { name: 'Previous track', exact: true }).click();
  await page.getByRole('button', { name: 'Previous track', exact: true }).click();
  await expect(nowPlaying(page)).toHaveText('PlayingBrown noise');

  await page.getByRole('button', { name: 'Pause music', exact: true }).click();
  await expect(nowPlaying(page)).toHaveText('LoadedBrown noise');
  await page.getByRole('button', { name: 'Play music', exact: true }).click();
  await expect(nowPlaying(page)).toHaveText('PlayingBrown noise');
  expect((await focusLog(page)).filter(entry => entry === 'stop' || entry.startsWith('start'))).toEqual([
    'start 2 channels 30 s', 'stop', 'start 2 channels 30 s', 'stop', 'start 2 channels 30 s', 'stop', 'start 2 channels 30 s',
    'stop', 'start 2 channels 30 s',
  ]);
  expect(youtube).toEqual([]);
});

test('a chosen focus sound comes back after a refresh without playing, and Stop returns to the queue', async ({ page }) => {
  await page.goto('/');
  await openFocusSounds(page);
  await page.getByRole('button', { name: 'Play Focus sounds' }).click();
  await expect(nowPlaying(page)).toHaveText('PlayingRain');

  await page.reload();
  await expect(nowPlaying(page)).toHaveText('LoadedRain');
  expect(await focusLog(page)).toEqual([]);
  await page.getByRole('button', { name: 'Play music', exact: true }).click();
  await expect(nowPlaying(page)).toHaveText('PlayingRain');

  await page.getByRole('button', { name: 'Stop playback' }).click();
  await expect(nowPlaying(page)).toContainText('No track loaded');
  expect(await focusLog(page)).toEqual(['start 2 channels 30 s', 'stop']);
  expect(await page.evaluate(() => localStorage.getItem('pomodoro_focus_sound'))).toBeNull();
});

test('volume and mute apply to focus sounds', async ({ page }) => {
  await page.goto('/');
  await openFocusSounds(page);
  await page.getByRole('button', { name: 'Play focus sound 3: White noise' }).click();
  await page.getByRole('button', { name: 'Mute' }).click();
  await page.getByRole('button', { name: 'Unmute' }).click();
  await page.getByLabel('Volume control').fill('100');
  expect((await focusLog(page)).filter(entry => entry.startsWith('volume'))).toEqual(['volume 0', 'volume 0.25', 'volume 1']);
});

test('choosing a focus sound pauses YouTube in place; playing a YouTube track stops the focus sound', async ({ page }) => {
  await fakeYouTube(page);
  await page.goto('/');
  await playYouTube(page);
  await page.evaluate(() => (window as any).__mediaSetTime(42));
  await page.getByRole('button', { name: 'Show video' }).click();
  const videoHeight = () => page.locator('#youtube-player-host').evaluate(element => (element as HTMLElement).offsetHeight);
  await expect.poll(videoHeight).toBeGreaterThan(100);

  await openFocusSounds(page);
  await page.getByRole('button', { name: 'Play focus sound 2: Ocean waves' }).click();
  await expect(nowPlaying(page)).toHaveText('PlayingOcean waves');
  expect(await page.evaluate(() => (window as any).__mediaCalls.at(-1))).toEqual(['pause', 'aaaaaaaaaaa']);
  // The paused video is not shown while a focus sound plays, and only the focus sound is current
  await expect.poll(videoHeight).toBe(0);
  await expect(page.getByRole('button', { name: 'Show video' })).toBeDisabled();
  await expect(player(page).locator('.list-row.is-selected')).toHaveCount(1);
  await expect(player(page).locator('.list-row.is-selected')).toContainText('Focus sounds');

  // Stop leaves the focus sound; YouTube carries on from where it paused
  await page.getByRole('button', { name: 'Stop playback' }).click();
  await expect(nowPlaying(page)).toHaveText('Loadedaaaaaaaaaaa');
  await expect.poll(videoHeight).toBeGreaterThan(100);
  await page.getByRole('button', { name: 'Play music', exact: true }).click();
  await expect(nowPlaying(page)).toHaveText('Playingaaaaaaaaaaa');
  expect(await page.evaluate(() => (window as any).__mediaPosition())).toEqual({ video: 'aaaaaaaaaaa', time: 42 });

  // Playing a queue track takes over from a focus sound
  await page.getByRole('button', { name: 'Play focus sound 1: Rain' }).click();
  await expect(nowPlaying(page)).toHaveText('PlayingRain');
  await page.getByRole('button', { name: 'Play Lofi' }).click();
  await expect(nowPlaying(page)).toHaveText('Playingaaaaaaaaaaa');
  expect((await focusLog(page)).at(-1)).toBe('stop');
  expect(await page.evaluate(() => localStorage.getItem('pomodoro_focus_sound'))).toBeNull();
});

test('YouTube starting from outside the app, such as a media key, takes over from a focus sound', async ({ page }) => {
  await fakeYouTube(page);
  await page.goto('/');
  await playYouTube(page);
  await openFocusSounds(page);
  await page.getByRole('button', { name: 'Play focus sound 1: Rain' }).click();
  await expect(nowPlaying(page)).toHaveText('PlayingRain');
  await page.evaluate(() => (window as any).__mediaEmit(1));
  await expect(nowPlaying(page)).toHaveText('Playingaaaaaaaaaaa');
  expect((await focusLog(page)).at(-1)).toBe('stop');
});

test('a focus sound carries on when the app returns after the browser suspended its audio', async ({ page }) => {
  await page.goto('/');
  await openFocusSounds(page);
  await page.getByRole('button', { name: 'Play focus sound 1: Rain' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__audioContext.state)).toBe('running');
  await page.evaluate(async () => {
    await (window as any).__audioContext.suspend();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => page.evaluate(() => (window as any).__audioContext.state)).toBe('running');
  await expect(nowPlaying(page)).toHaveText('PlayingRain');
});

test('the Stats tab shows the slim player for a focus sound, and Stop hides it', async ({ page }) => {
  await page.goto('/');
  await openFocusSounds(page);
  await page.getByRole('button', { name: 'Play focus sound 4: Pink noise' }).click();
  await page.getByRole('button', { name: 'Stats', exact: true }).click();
  await expect(nowPlaying(page)).toHaveText('PlayingPink noise');
  await expect(player(page).getByRole('slider')).toHaveCount(0);
  await player(page).getByRole('button', { name: 'Pause music', exact: true }).click();
  await expect(nowPlaying(page)).toHaveText('LoadedPink noise');
  await player(page).getByRole('button', { name: 'Stop playback' }).click();
  await expect(player(page)).toBeHidden();
});
