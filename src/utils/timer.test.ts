import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTime, calculateProgress, parseYouTubeId, clamp } from './timer.ts';

test('formatTime formats seconds into mm:ss properly', () => {
  assert.equal(formatTime(1500), '25:00');
  assert.equal(formatTime(300), '05:00');
  assert.equal(formatTime(59), '00:59');
  assert.equal(formatTime(5), '00:05');
  assert.equal(formatTime(0), '00:00');
  assert.equal(formatTime(-10), '00:00');
});

test('calculateProgress calculates 0% to 100% percentage correctly', () => {
  assert.equal(calculateProgress(1500, 1500), 0);
  assert.equal(calculateProgress(750, 1500), 50);
  assert.equal(calculateProgress(0, 1500), 100);
  assert.equal(calculateProgress(-10, 1500), 100);
  assert.equal(calculateProgress(1600, 1500), 0);
});

test('parseYouTubeId extracts video ID from different YouTube URL structures', () => {
  assert.equal(parseYouTubeId('https://www.youtube.com/watch?v=jfKfPfyJRdk'), 'jfKfPfyJRdk');
  assert.equal(parseYouTubeId('https://youtu.be/jfKfPfyJRdk'), 'jfKfPfyJRdk');
  assert.equal(parseYouTubeId('https://www.youtube.com/embed/jfKfPfyJRdk'), 'jfKfPfyJRdk');
  assert.equal(parseYouTubeId('https://www.youtube.com/live/jfKfPfyJRdk?feature=share'), 'jfKfPfyJRdk');
  assert.equal(parseYouTubeId('jfKfPfyJRdk'), 'jfKfPfyJRdk');
  assert.equal(parseYouTubeId('invalid-url'), null);
});

test('clamp restricts number to range', () => {
  assert.equal(clamp(5, 1, 10), 5);
  assert.equal(clamp(0, 1, 10), 1);
  assert.equal(clamp(15, 1, 10), 10);
});
