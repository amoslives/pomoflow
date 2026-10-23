/**
 * Web Audio synthesizer for Pomoflow alerts and ambient soundscapes
 */
import { RENDER_RATE, focusSoundGain, renderFocusSound, type FocusSoundId } from './focusSounds';

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Play retro 8-bit style notification sound for work completion
 */
export function playWorkCompleteChime() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
  notes.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, now + idx * 0.12);

    gain.gain.setValueAtTime(0.08, now + idx * 0.12);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.12 + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now + idx * 0.12);
    osc.stop(now + idx * 0.12 + 0.35);
  });
}

/**
 * Play retro chime for break completion
 */
export function playBreakCompleteChime() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const notes = [783.99, 659.25, 523.25, 783.99];
  notes.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + idx * 0.14);

    gain.gain.setValueAtTime(0.1, now + idx * 0.14);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.14 + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now + idx * 0.14);
    osc.stop(now + idx * 0.14 + 0.4);
  });
}

/**
 * Play subtle click sound for buttons
 */
export function playClickSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.04);

    gain.gain.setValueAtTime(0.03, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.04);
  } catch {
    // Ignore audio context errors
  }
}

// Fades keep starting and stopping a focus sound from clicking
const FOCUS_FADE_IN = 0.4;
const FOCUS_FADE_OUT = 0.15;

// The focus sound held in memory, the node playing it, and the volume they go through
let focusBuffer: { id: FocusSoundId; buffer: AudioBuffer } | null = null;
let focusPlayback: { source: AudioBufferSourceNode; fade: GainNode } | null = null;
let focusVolume: GainNode | null = null;
let focusLevel = focusSoundGain(50);

// iOS mutes Web Audio with the silent switch unless the page says it is playing media
function setAudioSession(type: 'playback' | 'auto') {
  try {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = type;
  } catch {}
}

function fadeOutFocusSound() {
  const playback = focusPlayback;
  focusPlayback = null;
  if (!playback || !audioCtx) return;
  const now = audioCtx.currentTime;
  try {
    playback.fade.gain.cancelScheduledValues(now);
    playback.fade.gain.setValueAtTime(playback.fade.gain.value, now);
    playback.fade.gain.linearRampToValueAtTime(0, now + FOCUS_FADE_OUT);
    playback.source.onended = () => playback.fade.disconnect();
    playback.source.stop(now + FOCUS_FADE_OUT);
  } catch {}
}

/**
 * Plays a focus sound in a loop, rendering it first unless it is already in memory.
 * Returns false if this browser cannot play it.
 */
export function startFocusSound(id: FocusSoundId): boolean {
  setAudioSession('playback');
  const ctx = getAudioContext();
  if (!ctx) return false;
  try {
    fadeOutFocusSound();
    if (focusBuffer?.id !== id) {
      // Let the previous sound go before rendering the next
      focusBuffer = null;
      const channels = renderFocusSound(id, RENDER_RATE);
      const buffer = ctx.createBuffer(channels.length, channels[0]!.length, RENDER_RATE);
      channels.forEach((samples, channel) => buffer.copyToChannel(samples, channel));
      focusBuffer = { id, buffer };
    }
    if (!focusVolume) {
      focusVolume = ctx.createGain();
      focusVolume.gain.value = focusLevel;
      focusVolume.connect(ctx.destination);
    }
    const source = ctx.createBufferSource();
    source.buffer = focusBuffer.buffer;
    source.loop = true;
    const fade = ctx.createGain();
    const now = ctx.currentTime;
    fade.gain.setValueAtTime(0, now);
    fade.gain.linearRampToValueAtTime(1, now + FOCUS_FADE_IN);
    source.connect(fade).connect(focusVolume);
    source.start(now);
    focusPlayback = { source, fade };
    return true;
  } catch {
    return false;
  }
}

export function pauseFocusSound() {
  fadeOutFocusSound();
  setAudioSession('auto');
}

// Pauses and frees the memory the sound took
export function unloadFocusSound() {
  pauseFocusSound();
  focusBuffer = null;
}

// Volume from 0 to 100, like the YouTube player's
export function setFocusSoundVolume(volume: number) {
  focusLevel = focusSoundGain(volume);
  if (focusVolume && audioCtx) focusVolume.gain.setTargetAtTime(focusLevel, audioCtx.currentTime, 0.05);
}

// Browsers can suspend audio while the app is in the background; carry on once it is back
export function resumeFocusSound() {
  if (focusPlayback && audioCtx && audioCtx.state !== 'running') audioCtx.resume().catch(() => {});
}
