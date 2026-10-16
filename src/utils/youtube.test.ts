import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseYouTubeSource,
  getNextTrackIndex,
  getPrevTrackIndex,
  shuffleArray,
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
  assert.equal(getNextTrackIndex(4, 5, false, 'off'), 4); // Stays at end when repeat off
});

test('getNextTrackIndex repeat one stays on current', () => {
  assert.equal(getNextTrackIndex(2, 5, false, 'one'), 2);
  assert.equal(getNextTrackIndex(2, 5, true, 'one'), 2);
});

test('getNextTrackIndex shuffle mode picks from available unplayed tracks', () => {
  const unplayed = [1, 3];
  const next = getNextTrackIndex(0, 5, true, 'all', unplayed);
  assert.ok(unplayed.includes(next));
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
