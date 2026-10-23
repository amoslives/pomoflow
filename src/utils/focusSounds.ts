/**
 * Built-in focus sounds, rendered on the device as seamless stereo loops
 */

export const FOCUS_SOUNDS = [
  { id: 'rain', title: 'Rain', description: 'Steady rain' },
  { id: 'ocean', title: 'Ocean waves', description: 'Slow surf' },
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
const TARGET_RMS: Record<FocusSoundId, number> = { rain: 0.13, ocean: 0.13, white: 0.07, pink: 0.11, brown: 0.18 };

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
  for (const sample of samples) sum += sample * sample;
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
  const longest = Math.ceil(rate * 0.03);
  const count = Math.round(length / rate * 30);
  for (let d = 0; d < count; d++) {
    const start = Math.floor(random() * (length - longest));
    const decay = Math.exp(-1 / (rate * (0.001 + 0.004 * random())));
    let size = 0.05 + 0.95 * random() ** 4;
    for (let i = start; i < start + longest && size > 0.001; i++, size *= decay) drops[i]! += size * (random() * 2 - 1);
  }
  highPass(drops, 1500, rate);
  let peak = 0;
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(drops[i]!));
  // The loudest drop stands out from the hiss without dwarfing it
  const dropGain = 4 / (peak || 1);

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

const GENERATORS: Record<FocusSoundId, Generator> = { rain, ocean, white, pink, brown };

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
    for (const sample of samples) { peak = Math.max(peak, Math.abs(sample)); sum += sample * sample; }
  }
  const level = Math.sqrt(sum / (2 * loop)) || 1;
  const gain = Math.min(TARGET_RMS[id] / level, PEAK / (peak || 1));
  return channels.map((samples) => scale(samples, gain));
}
