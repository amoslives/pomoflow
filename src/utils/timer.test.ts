import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTime, formatLateness, calculateProgress, parseYouTubeId, clamp } from './timer.ts';

test('formatTime formats seconds into mm:ss properly', () => {
  assert.equal(formatTime(1500), '25:00');
  assert.equal(formatTime(300), '05:00');
  assert.equal(formatTime(59), '00:59');
  assert.equal(formatTime(5), '00:05');
  assert.equal(formatTime(0), '00:00');
  assert.equal(formatTime(-10), '00:00');
});

test('formatLateness rounds to minutes and adds hours past an hour', () => {
  assert.equal(formatLateness(120), '2 min');
  assert.equal(formatLateness(149), '2 min');
  assert.equal(formatLateness(150), '3 min');
  assert.equal(formatLateness(10), '1 min');
  assert.equal(formatLateness(59 * 60 + 29), '59 min');
  assert.equal(formatLateness(60 * 60), '1 h');
  assert.equal(formatLateness(2 * 3600 + 5 * 60), '2 h 5 min');
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
