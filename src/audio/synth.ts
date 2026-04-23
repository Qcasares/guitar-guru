// Plucked-string synthesizer — Karplus-Strong resonator.
//
// Each `pluck()` builds a short-lived voice graph:
//
//   noiseBurst ──► delay ⇄ (lowpass → fbGain → back to delay)
//                           │
//                           ▼
//                       voiceSum ┐
//                                ├─► bodyEQ ─► outGain ─► panner ──► master
//   pickClick ─► bandpass ─► ────┘                                ─► reverbSend
//
// - noiseBurst   : ~6 ms of white noise into the delay-line, excites the string
// - delay loop   : delay=1/freq with a damping biquad in the feedback path,
//                  feedback gain = 0.994 - 0.0004*freq (high strings damp faster)
// - pickClick    : ~3 ms bandpassed noise at -12 dB, the audible pick attack
// - bodyEQ       : peaking filter at 160 Hz +3 dB, suggests resonant body
// - panner       : per-string pan from -0.45 (low E) to +0.45 (high e)
// - humanization : tiny timing, amplitude, and pitch jitter per voice
//
// All sources self-stop and nodes self-disconnect shortly after their sustain
// window, so no pool is needed at typical strum polyphony.

import type { ChordShape, TabNote, Finger } from '../music/types';
import { getSharedCtx } from './audio-context';

// Standard tuning, in Hz — index 0 = string 6 (low E), index 5 = string 1 (high e).
const OPEN_FREQ: Record<number, number> = {
  6: 82.407,   // E2
  5: 110.000,  // A2
  4: 146.832,  // D3
  3: 195.998,  // G3
  2: 246.942,  // B3
  1: 329.628,  // E4
};

const STRING_PAN: Record<number, number> = {
  6: -0.45,
  5: -0.27,
  4: -0.09,
  3: +0.09,
  2: +0.27,
  1: +0.45,
};

function noteFreq(stringNum: number, fret: number): number {
  const base = OPEN_FREQ[stringNum];
  return base * 2 ** (fret / 12);
}

// Deterministic LCG so strums sound humanized but unit tests are reproducible.
let seed = 0x1a2b3c4d >>> 0;
function rand(): number {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 0x1_0000_0000;
}
function rrand(lo: number, hi: number): number {
  return lo + rand() * (hi - lo);
}

/** Seed the humanization PRNG. Tests call this for reproducibility. */
export function setHumanizationSeed(s: number): void {
  seed = s >>> 0;
}

// ---------- pre-built shared noise buffer ----------

let noiseBuffer: AudioBuffer | null = null;
function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const len = Math.max(1024, Math.floor(ctx.sampleRate * 0.05)); // up to 50 ms
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buf;
  return buf;
}

// ---------- master volume API (kept for App compatibility) ----------

export function setMasterVolume(vol: number): void {
  const { ctx, master } = getSharedCtx();
  master.gain.setTargetAtTime(Math.max(0, Math.min(1, vol)), ctx.currentTime, 0.02);
}

export interface PluckOpts {
  /** When in seconds (AudioContext time) to trigger the note. */
  when?: number;
  /** Gain envelope peak, 0..1. */
  gain?: number;
  /** Approximate sustain time in seconds before cleanup. */
  sustain?: number;
}

// ---------- Karplus-Strong pluck ----------

export function pluck(stringNum: number, fret: number, opts: PluckOpts = {}): void {
  const { ctx, master, reverbSend } = getSharedCtx();
  const baseWhen = opts.when ?? ctx.currentTime;
  const baseGain = opts.gain ?? 0.55;
  const sustain = opts.sustain ?? 0.9;

  // Humanization — tiny per-voice variation so every strum sits slightly different.
  const when = Math.max(ctx.currentTime, baseWhen + rrand(-0.0015, 0.0015));
  const gain = Math.max(0, baseGain * rrand(0.9, 1.1));
  const freq = noteFreq(stringNum, fret) * (1 + rrand(-0.003, 0.003));

  const pan = STRING_PAN[stringNum] ?? 0;

  // ---- String resonator (Karplus-Strong) ----
  //
  // Excitation: short pink-ish noise burst shaped by an envelope that peaks at
  // ~0.28 (NOT 1.0). The raw noise buffer is ±1; sending that into the delay
  // line at full amplitude makes the KS output also ±1 per cycle, and a 6-string
  // strum sums to ~1.7 at the destination, which hard-clips the DAC into the
  // "screaming distortion" regime. 0.28 keeps per-voice dry peak ≈ 0.08 at
  // destination (×bodyEQ ×outGain ×master), so even 6 overlapping voices stay
  // under 0.5 at the bus.
  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = getNoiseBuffer(ctx);
  const burstGain = ctx.createGain();
  const burstDur = 0.006;
  const excitationPeak = 0.28;
  // Trapezoidal window so the burst edges don't pop — 0.5 ms fade in/out.
  burstGain.gain.setValueAtTime(0, when);
  burstGain.gain.linearRampToValueAtTime(excitationPeak, when + 0.0005);
  burstGain.gain.setValueAtTime(excitationPeak, when + burstDur);
  burstGain.gain.linearRampToValueAtTime(0, when + burstDur + 0.0005);

  const delay = ctx.createDelay(0.05);
  delay.delayTime.value = 1 / freq;

  const fbLpf = ctx.createBiquadFilter();
  fbLpf.type = 'lowpass';
  fbLpf.Q.value = 0.7;
  fbLpf.frequency.value = Math.min(freq * 8, 12000);

  const fbGain = ctx.createGain();
  fbGain.gain.value = Math.max(0.5, 0.994 - 0.0004 * freq);

  noiseSource.connect(burstGain);
  burstGain.connect(delay);
  delay.connect(fbLpf);
  fbLpf.connect(fbGain);
  fbGain.connect(delay); // feedback loop

  // Voice output (pre-body).
  const voiceOut = ctx.createGain();
  voiceOut.gain.value = 1;
  delay.connect(voiceOut);

  // ---- Pick transient (parallel click) ----
  // Scaled-down peak; the filtered-noise click is ADD'd to the KS output, so
  // any boost here counts directly against the voice's peak budget.
  const pickSource = ctx.createBufferSource();
  pickSource.buffer = getNoiseBuffer(ctx);
  const pickBandpass = ctx.createBiquadFilter();
  pickBandpass.type = 'bandpass';
  pickBandpass.frequency.value = 2000;
  pickBandpass.Q.value = 1.1;
  const pickGain = ctx.createGain();
  pickGain.gain.setValueAtTime(0.0001, when);
  pickGain.gain.exponentialRampToValueAtTime(0.08, when + 0.001);
  pickGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.003);
  pickSource.connect(pickBandpass).connect(pickGain).connect(voiceOut);

  // ---- Body EQ + overall envelope + pan ----
  // +1.5 dB is enough to suggest a resonant body without adding another
  // multiplicative 1.4× to the voice peak.
  const bodyEQ = ctx.createBiquadFilter();
  bodyEQ.type = 'peaking';
  bodyEQ.frequency.value = 160;
  bodyEQ.Q.value = 1.2;
  bodyEQ.gain.value = 1.5;

  const outGain = ctx.createGain();
  outGain.gain.setValueAtTime(gain, when);
  // Gentle release — mostly KS decay does the work, this just ensures cleanup.
  outGain.gain.setTargetAtTime(0, when + sustain, 0.12);

  const panner = ctx.createStereoPanner();
  panner.pan.value = pan;

  voiceOut.connect(bodyEQ);
  bodyEQ.connect(outGain);
  outGain.connect(panner);
  panner.connect(master);
  panner.connect(reverbSend);

  // ---- Start + schedule cleanup ----
  noiseSource.start(when);
  noiseSource.stop(when + burstDur + 0.05);
  pickSource.start(when);
  pickSource.stop(when + 0.01);

  const teardownAt = when + sustain + 0.3;
  const msUntilTeardown = Math.max(0, (teardownAt - ctx.currentTime) * 1000);
  setTimeout(() => {
    try {
      fbGain.disconnect();
      fbLpf.disconnect();
      delay.disconnect();
      voiceOut.disconnect();
      bodyEQ.disconnect();
      outGain.disconnect();
      panner.disconnect();
    } catch {
      /* ignore — nodes already GC'd */
    }
  }, msUntilTeardown + 100);
}

// ---------- strum ----------

/** Curved offset — slow into the strings, accelerate through. */
function curvedOffset(i: number, n: number, spread: number): number {
  if (n <= 1) return 0;
  return spread * (i + (i * (i - 1)) * 0.15 / (n - 1));
  // Roughly quadratic-ish; within i=0..n-1 the spacing widens monotonically.
}

export interface StrumOpts {
  direction?: 'down' | 'up';
  when?: number;
  spread?: number;
  gain?: number;
}

const DB = (db: number): number => Math.pow(10, db / 20);

/** Strum a chord — notes fire sequentially across strings to imitate a pick stroke. */
export function strum(chord: ChordShape, opts: StrumOpts = {}): void {
  const { ctx } = getSharedCtx();
  const direction = opts.direction ?? 'down';
  const spread = opts.spread ?? 0.015;
  const when0 = opts.when ?? ctx.currentTime;
  const startFret = chord.startFret ?? 1;
  const peak = opts.gain ?? 0.5;

  // Resolve which strings actually ring — fretted + open, not muted.
  const voicings = new Map<number, { fret: number; finger?: Finger }>();
  for (const n of chord.notes) {
    if (n.muted) continue;
    if (n.open) voicings.set(n.string, { fret: 0 });
    else voicings.set(n.string, { fret: n.fret + startFret - 1, finger: n.finger });
  }
  for (const b of chord.barres ?? []) {
    const from = Math.min(b.fromString, b.toString);
    const to = Math.max(b.fromString, b.toString);
    for (let s = from; s <= to; s++) {
      if (!voicings.has(s)) voicings.set(s, { fret: b.fret, finger: b.finger });
    }
  }

  const order = [6, 5, 4, 3, 2, 1].filter((s) => voicings.has(s));
  const sequence = direction === 'down' ? order : [...order].reverse();
  const n = sequence.length;

  sequence.forEach((stringNum, i) => {
    const v = voicings.get(stringNum)!;
    const isLowGroup = stringNum >= 4;
    // Downstrokes lean low, upstrokes lean high — ~±1 dB each side.
    const directionGain = direction === 'down'
      ? (isLowGroup ? DB(+1) : DB(-1))
      : (isLowGroup ? DB(-1) : DB(+1));
    pluck(stringNum, v.fret, {
      when: when0 + curvedOffset(i, n, spread),
      gain: peak * directionGain,
      sustain: 1.4,
    });
  });
}

/** Play a single tab note (used in lead mode). */
export function playTabNote(n: TabNote, opts: { when?: number; gain?: number } = {}): void {
  if (typeof n.fret !== 'number') return;
  pluck(n.string, n.fret, { when: opts.when, gain: opts.gain ?? 0.6, sustain: 0.75 });
}
