import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseYouTubeSource,
  getNextTrackIndex,
  getPrevTrackIndex,
  shuffleArray,
  fetchYouTubeVideoMetadata,
} from './youtube.ts';

test('parseYouTubeSource parses video URLs and IDs', () => {
  assert.deepEqual(parseYouTubeSource('https://www.youtube.com/watch?v=jfKfPfyJRdk'), {
    type: 'video',
    id: 'jfKfPfyJRdk',
  });

  assert.deepEqual(parseYouTubeSource('https://youtu.be/jfKfPfyJRdk'), {
    type: 'video',
    id: 'jfKfPfyJRdk',
  });

  assert.deepEqual(parseYouTubeSource('https://www.youtube.com/shorts/jfKfPfyJRdk'), {
    type: 'video',
    id: 'jfKfPfyJRdk',
  });

  assert.deepEqual(parseYouTubeSource('jfKfPfyJRdk'), {
    type: 'video',
    id: 'jfKfPfyJRdk',
  });
});

test('parseYouTubeSource parses playlist URLs and IDs', () => {
  assert.deepEqual(
    parseYouTubeSource('https://www.youtube.com/playlist?list=PLw-VjHDlEOgvWk_T7GZ_2xQ5_rLw'),
    {
      type: 'playlist',
      id: 'PLw-VjHDlEOgvWk_T7GZ_2xQ5_rLw',
    }
  );

  assert.deepEqual(
    parseYouTubeSource('PLw-VjHDlEOgvWk_T7GZ_2xQ5_rLw'),
    {
      type: 'playlist',
      id: 'PLw-VjHDlEOgvWk_T7GZ_2xQ5_rLw',
    }
  );
});

test('parseYouTubeSource returns null for invalid input', () => {
  assert.equal(parseYouTubeSource(''), null);
  assert.equal(parseYouTubeSource('not-a-valid-url'), null);
});

test('getNextTrackIndex normal mode advances sequentially', () => {
  assert.equal(getNextTrackIndex(0, 5, false, 'all'), 1);
  assert.equal(getNextTrackIndex(1, 5, false, 'all'), 2);
  assert.equal(getNextTrackIndex(4, 5, false, 'all'), 0); // Loops around when repeat all
  assert.equal(getNextTrackIndex(4, 5, false, 'off'), -1); // Stops at end when repeat off
});

test('getNextTrackIndex repeat one stays on current', () => {
  assert.equal(getNextTrackIndex(2, 5, false, 'one'), 2);
  assert.equal(getNextTrackIndex(2, 5, true, 'one'), 2);
});

test('getNextTrackIndex stops a single-item queue when repeat is off', () => {
  assert.equal(getNextTrackIndex(0, 1, false, 'off'), -1);
  assert.equal(getNextTrackIndex(0, 1, false, 'all'), 0);
});

test('getNextTrackIndex shuffle mode picks from available unplayed tracks', () => {
  const unplayed = [1, 3];
  const next = getNextTrackIndex(0, 5, true, 'all', unplayed);
  assert.ok(unplayed.includes(next));
  assert.equal(getNextTrackIndex(2, 5, true, 'off', []), -1);
});

test('getPrevTrackIndex steps backwards correctly', () => {
  assert.equal(getPrevTrackIndex(2, 5, 'all'), 1);
  assert.equal(getPrevTrackIndex(0, 5, 'all'), 4);
  assert.equal(getPrevTrackIndex(0, 5, 'off'), 0);
  assert.equal(getPrevTrackIndex(3, 5, 'one'), 3);
});

test('shuffleArray preserves items and length without mutating original', () => {
  const original = ['A', 'B', 'C', 'D', 'E'];
  const shuffled = shuffleArray(original);

  assert.equal(shuffled.length, original.length);
  assert.deepEqual([...shuffled].sort(), [...original].sort());
  assert.notEqual(original, shuffled); // Not same reference
});

test('fetchYouTubeVideoMetadata returns public oEmbed metadata', async () => {
  const metadata = await fetchYouTubeVideoMetadata('jfKfPfyJRdk', async () =>
    new Response(JSON.stringify({
      title: 'lofi hip hop radio',
      author_name: 'Lofi Girl',
      thumbnail_url: 'https://example.com/thumb.jpg',
    }), { status: 200 })
  );

  assert.deepEqual(metadata, {
    videoId: 'jfKfPfyJRdk',
    title: 'lofi hip hop radio',
    author: 'Lofi Girl',
    thumbnailUrl: 'https://example.com/thumb.jpg',
  });
});

test('fetchYouTubeVideoMetadata returns null when metadata is unavailable', async () => {
  const metadata = await fetchYouTubeVideoMetadata('jfKfPfyJRdk', async () =>
    new Response('Not found', { status: 404 })
  );

  assert.equal(metadata, null);
});
