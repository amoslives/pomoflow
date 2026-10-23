import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FOCUS_SOUNDS,
  LOOP_SECONDS,
  focusSoundGain,
  isFocusSoundId,
  renderFocusSound,
  waveHeight,
  type FocusSoundId,
} from './focusSounds.ts';

// A lower rate than the app's keeps the tests quick; the sounds are built the same way
const RATE = 16000;

// The same random numbers on every run (mulberry32)
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rendered = new Map<FocusSoundId, Float32Array[]>();
function render(id: FocusSoundId) {
  if (!rendered.has(id)) rendered.set(id, renderFocusSound(id, RATE, seeded(7)));
  return rendered.get(id)!;
}

function rms(samples: Float32Array, start = 0, end = samples.length) {
  let sum = 0;
  for (let i = start; i < end; i++) sum += samples[i]! ** 2;
  return Math.sqrt(sum / (end - start));
}

function meanStep(samples: Float32Array) {
  let sum = 0;
  for (let i = 1; i < samples.length; i++) sum += Math.abs(samples[i]! - samples[i - 1]!);
  return sum / (samples.length - 1);
}

// Loudness of each second of the loop
function secondLevels(samples: Float32Array) {
  return Array.from({ length: LOOP_SECONDS }, (_, second) => rms(samples, second * RATE, (second + 1) * RATE));
}

const crest = (id: FocusSoundId) => {
  const samples = render(id)[0]!;
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  return peak / rms(samples);
};

test('every focus sound is a stereo loop of the full length, within range and at a comfortable level', () => {
  for (const { id } of FOCUS_SOUNDS) {
    const channels = render(id);
    assert.equal(channels.length, 2, id);
    for (const samples of channels) {
      assert.equal(samples.length, LOOP_SECONDS * RATE, id);
      assert.ok(samples.every((sample) => Number.isFinite(sample) && Math.abs(sample) <= 0.95), id);
      const level = rms(samples);
      assert.ok(level > 0.05 && level < 0.2, `${id} level ${level}`);
    }
    assert.notDeepEqual(channels[0], channels[1], `${id} channels differ`);
  }
});

test('the end of each loop runs into its start without a jump', () => {
  for (const { id } of FOCUS_SOUNDS) {
    for (const samples of render(id)) {
      const last = samples.length - 1;
      const seam = Math.abs(samples[last]! - samples[0]!);
      // The largest step among the samples either side of the seam
      let nearby = 0;
      for (let i = 1; i < 100; i++) {
        nearby = Math.max(nearby, Math.abs(samples[i]! - samples[i - 1]!), Math.abs(samples[last - i + 1]! - samples[last - i]!));
      }
      assert.ok(seam <= 1.5 * nearby, `${id} seam ${seam}, nearby steps up to ${nearby}`);
    }
  }
});

test('brown noise is darker than pink, and pink darker than white', () => {
  const brightness = (id: FocusSoundId) => meanStep(render(id)[0]!) / rms(render(id)[0]!);
  assert.ok(brightness('brown') < brightness('pink'));
  assert.ok(brightness('pink') < brightness('white'));
});

test('the ocean and the wind swell and fall while the other sounds stay steady', () => {
  // Both ears together, so the fan turning from side to side does not count as a swell
  const swing = (id: FocusSoundId) => {
    const [left, right] = render(id).map(secondLevels);
    const levels = left!.map((level, second) => Math.hypot(level, right![second]!));
    return Math.max(...levels) / Math.min(...levels);
  };
  for (const id of ['ocean', 'wind'] as const) assert.ok(swing(id) > 2.5, `${id} ${swing(id)}`);
  for (const id of ['rain', 'stream', 'fireplace', 'fan', 'white', 'pink', 'brown'] as const) {
    assert.ok(swing(id) < 2, `${id} ${swing(id)}`);
  }
});

test('the fan turns from side to side, louder in one ear as it fades in the other', () => {
  const [left, right] = render('fan').map(secondLevels);
  const mean = (levels: number[]) => levels.reduce((sum, level) => sum + level, 0) / levels.length;
  const leftMean = mean(left!);
  const rightMean = mean(right!);
  let together = 0, leftSpread = 0, rightSpread = 0;
  left!.forEach((level, second) => {
    together += (level - leftMean) * (right![second]! - rightMean);
    leftSpread += (level - leftMean) ** 2;
    rightSpread += (right![second]! - rightMean) ** 2;
  });
  assert.ok(together / Math.sqrt(leftSpread * rightSpread) < -0.8);
});

test('the fireplace crackles: sharp peaks stand far above its level, unlike plain noise', () => {
  assert.ok(crest('fireplace') > 1.5 * crest('pink'), `fireplace ${crest('fireplace')}, pink ${crest('pink')}`);
});

test('waves repeat with the loop and each starts and ends calm', () => {
  for (let t = 0; t < LOOP_SECONDS; t += 0.37) {
    const height = waveHeight(t);
    assert.ok(height >= 0 && height <= 1);
    assert.ok(Math.abs(height - waveHeight(t + LOOP_SECONDS)) < 1e-9);
  }
  // 6.5 s is where the first wave ends and the second begins
  for (const t of [0, 6.5, LOOP_SECONDS]) assert.ok(waveHeight(t) < 1e-9, `at ${t}`);
  assert.ok(waveHeight(2.5) > 0.9);
});

test('rendering the same random numbers gives the same sound', () => {
  assert.deepEqual(renderFocusSound('rain', RATE, seeded(3)), renderFocusSound('rain', RATE, seeded(3)));
});

test('focusSoundGain follows the volume slider on a squared curve', () => {
  assert.equal(focusSoundGain(0), 0);
  assert.equal(focusSoundGain(50), 0.25);
  assert.equal(focusSoundGain(100), 1);
  assert.equal(focusSoundGain(-5), 0);
  assert.equal(focusSoundGain(150), 1);
});

test('isFocusSoundId accepts only the built-in sounds', () => {
  assert.ok(isFocusSoundId('rain'));
  assert.ok(!isFocusSoundId('drone'));
  assert.ok(!isFocusSoundId(null));
});
