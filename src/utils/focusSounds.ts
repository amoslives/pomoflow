/**
 * Built-in focus sounds, rendered on the device as seamless stereo loops
 */

export const FOCUS_SOUNDS = [
  { id: 'rain', title: 'Rain', description: 'Steady rain' },
  { id: 'ocean', title: 'Ocean waves', description: 'Slow surf' },
  { id: 'stream', title: 'Stream', description: 'Babbling brook' },
  { id: 'wind', title: 'Wind', description: 'Rising and falling gusts' },
  { id: 'fireplace', title: 'Fireplace', description: 'Crackling logs' },
  { id: 'fan', title: 'Fan', description: 'Turning side to side' },
  { id: 'white', title: 'White noise', description: 'Even hiss' },
  { id: 'pink', title: 'Pink noise', description: 'Softer, like a waterfall' },
  { id: 'brown', title: 'Brown noise', description: 'Deep rumble' },
] as const;

export type FocusSoundId = (typeof FOCUS_SOUNDS)[number]['id'];

export function isFocusSoundId(value: unknown): value is FocusSoundId {
  return FOCUS_SOUNDS.some((sound) => sound.id === value);
}

// Sounds render at this rate. It keeps everything up to 16 kHz, plenty for noise, with a third less
// work and memory than 48 kHz; the browser converts it to the output's rate.
export const RENDER_RATE = 32000;
// Long enough that the repeat goes unnoticed. Anything that changes over time repeats exactly this often.
export const LOOP_SECONDS = 30;
const CROSSFADE_SECONDS = 0.5;
// Filters settle before the loop starts
const WARMUP_SECONDS = 0.25;
const PEAK = 0.95;
// Slow changes are worked out once per block of samples, a millisecond or so
const BLOCK = 64;

// Loudness as RMS. Brighter sounds are set quieter so that all of them sound about as loud.
const TARGET_RMS: Record<FocusSoundId, number> = {
  rain: 0.13, ocean: 0.13, stream: 0.12, wind: 0.14, fireplace: 0.1, fan: 0.16, white: 0.07, pink: 0.11, brown: 0.18,
};

// Waves in one loop; their lengths add up to LOOP_SECONDS
const WAVES = [
  { seconds: 6.5, height: 1 },
  { seconds: 8, height: 0.7 },
  { seconds: 7, height: 0.9 },
  { seconds: 8.5, height: 0.6 },
];

type Random = () => number;
// One channel `length` samples long; sample i plays at i / rate seconds
type Generator = (length: number, rate: number, random: Random, channel: number) => Float32Array<ArrayBuffer>;

// Slider volume (0-100) as gain; squared, so the low end of the slider stays usable
export function focusSoundGain(volume: number): number {
  return (Math.min(100, Math.max(0, volume)) / 100) ** 2;
}

function rms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i]! * samples[i]!;
  return Math.sqrt(sum / samples.length) || 1;
}

function scale<T extends Float32Array>(samples: T, gain: number): T {
  for (let i = 0; i < samples.length; i++) samples[i]! *= gain;
  return samples;
}

// Coefficient of a one-pole filter with this cutoff
const onePole = (cutoff: number, rate: number) => 1 - Math.exp(-2 * Math.PI * cutoff / rate);

function lowPass<T extends Float32Array>(samples: T, cutoff: number, rate: number): T {
  const a = onePole(cutoff, rate);
  let y = 0;
  for (let i = 0; i < samples.length; i++) samples[i] = y += a * (samples[i]! - y);
  return samples;
}

function highPass<T extends Float32Array>(samples: T, cutoff: number, rate: number): T {
  const a = onePole(cutoff, rate);
  let low = 0;
  for (let i = 0; i < samples.length; i++) {
    low += a * (samples[i]! - low);
    samples[i] = samples[i]! - low;
  }
  return samples;
}

// A resonant band-pass filter (RBJ biquad). Its centre can move: `centre` is read once per block.
function bandPass<T extends Float32Array>(samples: T, centre: (t: number) => number, q: number, rate: number): T {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let block = 0; block < samples.length; block += BLOCK) {
    const w = 2 * Math.PI * Math.min(centre(block / rate), rate * 0.45) / rate;
    const alpha = Math.sin(w) / (2 * q);
    const b0 = alpha / (1 + alpha);
    const a1 = -2 * Math.cos(w) / (1 + alpha);
    const a2 = (1 - alpha) / (1 + alpha);
    const end = Math.min(samples.length, block + BLOCK);
    for (let i = block; i < end; i++) {
      const x = samples[i]!;
      const y = b0 * (x - x2) - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      samples[i] = y;
    }
  }
  return samples;
}

// Adds a burst of noise at `start` that dies away with this time constant
function addClick(samples: Float32Array, start: number, size: number, seconds: number, rate: number, random: Random) {
  const decay = Math.exp(-1 / (rate * seconds));
  for (let i = start; i < samples.length && size > 0.001; i++, size *= decay) samples[i]! += size * (random() * 2 - 1);
}

function peakOf(samples: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]!));
  return peak || 1;
}

// A slow wobble from 1 - depth to 1 + depth made of sines whose periods all divide LOOP_SECONDS
function wobble(t: number, periods: number[], depth: number, phase = 0): number {
  let sum = 0;
  periods.forEach((period, i) => { sum += Math.sin(2 * Math.PI * t / period + phase + i * 1.7) / (i + 1); });
  const most = periods.reduce((total, _, i) => total + 1 / (i + 1), 0);
  return 1 + depth * sum / most;
}

const white: Generator = (length, _rate, random) => {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = random() * 2 - 1;
  return out;
};

// Paul Kellet's pink noise filter
const pink: Generator = (length, _rate, random) => {
  const out = new Float32Array(length);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < length; i++) {
    const w = random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    out[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
  }
  return out;
};

// Integrated white noise that leaks slowly, so it cannot drift away from zero
const brown: Generator = (length, _rate, random) => {
  const out = new Float32Array(length);
  let last = 0;
  for (let i = 0; i < length; i++) out[i] = last = (last + 0.02 * (random() * 2 - 1)) / 1.02;
  return out;
};

const rain: Generator = (length, rate, random, channel) => {
  // Nearby drops: short clicks, mostly small
  const drops = new Float32Array(length);
  const count = Math.round(length / rate * 30);
  for (let d = 0; d < count; d++) {
    addClick(drops, Math.floor(random() * length), 0.05 + 0.95 * random() ** 4, 0.001 + 0.004 * random(), rate, random);
  }
  highPass(drops, 1500, rate);
  // The loudest drop stands out from the hiss without dwarfing it
  const dropGain = 4 / peakOf(drops);

  // The hiss of drops further away, swelling gently
  const hiss = lowPass(highPass(pink(length, rate, random, channel), 400, rate), 6000, rate);
  const hissGain = 1 / rms(hiss);
  for (let block = 0; block < length; block += BLOCK) {
    const t = block / rate;
    const swell = hissGain * (0.8 + 0.12 * Math.sin(2 * Math.PI * t / 10) + 0.08 * Math.sin(2 * Math.PI * t / 6 + channel));
    const end = Math.min(length, block + BLOCK);
    for (let i = block; i < end; i++) hiss[i] = hiss[i]! * swell + drops[i]! * dropGain;
  }
  return hiss;
};

// How high the surf is at time t, from 0 to 1. Each wave swells, breaks, then washes out slowly.
export function waveHeight(t: number): number {
  let time = ((t % LOOP_SECONDS) + LOOP_SECONDS) % LOOP_SECONDS;
  for (const wave of WAVES) {
    if (time < wave.seconds) return wave.height * Math.sin(Math.PI * (time / wave.seconds) ** 0.7) ** 2;
    time -= wave.seconds;
  }
  return 0;
}

const ocean: Generator = (length, rate, random, channel) => {
  const deep = brown(length, rate, random, channel);
  const hiss = pink(length, rate, random, channel);
  const deepGain = 0.8 / rms(deep);
  const hissGain = 0.6 / rms(hiss);
  const out = new Float32Array(length);
  let y = 0;
  for (let block = 0; block < length; block += BLOCK) {
    // The right channel trails slightly, so the waves move across
    const height = waveHeight(block / rate - channel * 0.35);
    // The surf brightens as each wave breaks
    const a = onePole(250 + 2500 * height, rate);
    const gain = 0.2 + 0.8 * height;
    const end = Math.min(length, block + BLOCK);
    for (let i = block; i < end; i++) {
      y += a * (deep[i]! * deepGain + hiss[i]! * hissGain - y);
      out[i] = y * gain;
    }
  }
  return out;
};

const stream: Generator = (length, rate, random, channel) => {
  // Bubbles: short tones whose pitch rises as each one closes
  const bubbles = new Float32Array(length);
  const count = Math.round(length / rate * 180);
  for (let b = 0; b < count; b++) {
    const start = Math.floor(random() * length);
    // 400 Hz to 2 kHz, spread evenly in pitch
    const pitch = 400 * 5 ** random();
    const seconds = 0.003 + 0.009 * random();
    const rise = 0.5 + 1.5 * random();
    const size = 0.1 + 0.9 * random() ** 2;
    const n = Math.min(length - start, Math.ceil(seconds * 4 * rate));
    const decay = Math.exp(-1 / (seconds * rate));
    // A half-millisecond attack, so a bubble never starts with a click
    const attack = Math.exp(-1 / (0.0005 * rate));
    let envelope = size;
    let opening = 1;
    // The tone is a turning vector (cos, sin); its step is updated every 8 samples as the pitch rises
    let cos = 1, sin = 0, stepCos = 1, stepSin = 0;
    for (let j = 0; j < n; j++, envelope *= decay, opening *= attack) {
      if ((j & 7) === 0) {
        const step = 2 * Math.PI * pitch * (1 + rise * (j + 4) / n) / rate;
        stepCos = Math.cos(step);
        stepSin = Math.sin(step);
      }
      const next = sin * stepCos + cos * stepSin;
      cos = cos * stepCos - sin * stepSin;
      sin = next;
      bubbles[start + j]! += envelope * (1 - opening) * sin;
    }
  }
  // The rush of water underneath
  const rush = bandPass(pink(length, rate, random, channel), () => 1200, 0.6, rate);
  const bubbleGain = 1 / rms(bubbles);
  const rushGain = 0.45 / rms(rush);
  for (let block = 0; block < length; block += BLOCK) {
    const flow = rushGain * wobble(block / rate, [7.5, 3], 0.15, channel);
    const end = Math.min(length, block + BLOCK);
    for (let i = block; i < end; i++) bubbles[i] = bubbles[i]! * bubbleGain + rush[i]! * flow;
  }
  return bubbles;
};

// How hard the wind blows at time t, from 0.1 to 1
export function gustStrength(t: number, channel = 0): number {
  return Math.min(1, Math.max(0.1, 0.55 + 0.45 * (wobble(t, [15, 7.5, 5], 1, channel * 0.6) - 1)));
}

const wind: Generator = (length, rate, random, channel) => {
  const strength = (t: number) => gustStrength(t, channel);
  // The rush of air, higher as it blows harder, with a thin whistle riding on it
  const rush = bandPass(pink(length, rate, random, channel), (t) => 250 + 650 * strength(t), 0.8, rate);
  const whistle = bandPass(white(length, rate, random, channel), (t) => 600 + 900 * strength(t), 12, rate);
  const rumble = lowPass(brown(length, rate, random, channel), 120, rate);
  const rushGain = 1 / rms(rush);
  const whistleGain = 0.35 / rms(whistle);
  const rumbleGain = 0.5 / rms(rumble);
  for (let block = 0; block < length; block += BLOCK) {
    const blow = strength(block / rate);
    const air = blow ** 1.5;
    const low = rumbleGain * (0.4 + 0.6 * blow);
    const end = Math.min(length, block + BLOCK);
    for (let i = block; i < end; i++) rush[i] = (rush[i]! * rushGain + whistle[i]! * whistleGain) * air + rumble[i]! * low;
  }
  return rush;
};

const fireplace: Generator = (length, rate, random, channel) => {
  // The soft roar of the flames and a faint hiss, both flickering
  const roar = lowPass(pink(length, rate, random, channel), 400, rate);
  const hiss = highPass(pink(length, rate, random, channel), 2500, rate);
  // Crackles come in clusters of sharp clicks, with a louder pop now and then
  const crackles = new Float32Array(length);
  const clusters = Math.round(length / rate * 4);
  for (let c = 0; c < clusters; c++) {
    let at = Math.floor(random() * length);
    const clicks = 1 + Math.floor(random() * 6);
    for (let k = 0; k < clicks && at < length; k++, at += Math.floor(rate * (0.004 + 0.04 * random()))) {
      addClick(crackles, at, 0.1 + 0.9 * random() ** 3, 0.0002 + 0.0012 * random(), rate, random);
    }
  }
  const pops = Math.round(length / rate * 0.4);
  for (let p = 0; p < pops; p++) addClick(crackles, Math.floor(random() * length), 1, 0.002 + 0.004 * random(), rate, random);
  highPass(crackles, 1000, rate);
  const roarGain = 0.6 / rms(roar);
  const hissGain = 0.25 / rms(hiss);
  const crackleGain = 5 / peakOf(crackles);
  for (let block = 0; block < length; block += BLOCK) {
    const flicker = wobble(block / rate, [3, 1.25, 0.6], 0.25, channel);
    const end = Math.min(length, block + BLOCK);
    for (let i = block; i < end; i++) roar[i] = (roar[i]! * roarGain + hiss[i]! * hissGain) * flicker + crackles[i]! * crackleGain;
  }
  return roar;
};

const fan: Generator = (length, rate, random, channel) => {
  // Air pushed through the blades: a deep rush with a softer whoosh above it
  const air = lowPass(brown(length, rate, random, channel), 900, rate);
  const hiss = lowPass(pink(length, rate, random, channel), 1500, rate);
  const airGain = 1 / rms(air);
  const hissGain = 0.5 / rms(hiss);
  // The motor hums at 100 Hz, with two overtones; each completes whole cycles in a loop.
  // The tone is a turning vector (cos, sin), and the overtones follow from it.
  const stepCos = Math.cos(2 * Math.PI * 100 / rate);
  const stepSin = Math.sin(2 * Math.PI * 100 / rate);
  let cos = 1, sin = 0;
  for (let block = 0; block < length; block += BLOCK) {
    const t = block / rate;
    // The head turns side to side every 10 seconds, so each ear hears it come and go in turn
    const sweep = 0.7 + 0.3 * Math.cos(2 * Math.PI * t / 10 + channel * Math.PI);
    const end = Math.min(length, block + BLOCK);
    for (let i = block; i < end; i++) {
      const hum = 0.06 * sin + 0.03 * 2 * sin * cos + 0.015 * (3 * sin - 4 * sin * sin * sin);
      air[i] = (air[i]! * airGain + hiss[i]! * hissGain) * sweep + hum;
      const next = sin * stepCos + cos * stepSin;
      cos = cos * stepCos - sin * stepSin;
      sin = next;
    }
  }
  return air;
};

const GENERATORS: Record<FocusSoundId, Generator> = { rain, ocean, stream, wind, fireplace, fan, white, pink, brown };

/**
 * Renders a focus sound as two channels LOOP_SECONDS long that play back to back without a seam.
 */
export function renderFocusSound(id: FocusSoundId, rate: number, random: Random = Math.random): Float32Array<ArrayBuffer>[] {
  const loop = Math.round(LOOP_SECONDS * rate);
  const fade = Math.round(CROSSFADE_SECONDS * rate);
  const warmup = Math.round(WARMUP_SECONDS * rate);
  const channels = [0, 1].map((channel) => {
    const samples = GENERATORS[id](warmup + loop + fade, rate, random, channel).subarray(warmup);
    // The loop's start fades in while what follows its end fades out, so the end runs on into the start
    const out = samples.slice(0, loop);
    for (let i = 0; i < fade; i++) {
      const x = i / fade;
      out[i] = samples[i]! * Math.sqrt(x) + samples[loop + i]! * Math.sqrt(1 - x);
    }
    return out;
  });
  // One gain for both channels keeps them balanced
  let peak = 0;
  let sum = 0;
  for (const samples of channels) {
    for (let i = 0; i < samples.length; i++) {
      peak = Math.max(peak, Math.abs(samples[i]!));
      sum += samples[i]! * samples[i]!;
    }
  }
  const level = Math.sqrt(sum / (2 * loop)) || 1;
  const gain = Math.min(TARGET_RMS[id] / level, PEAK / (peak || 1));
  return channels.map((samples) => scale(samples, gain));
}
