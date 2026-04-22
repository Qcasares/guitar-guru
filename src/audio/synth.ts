// A minimal plucked-string-ish synthesizer.
//
// Shares the AudioContext with `metronome.ts` via a second getCtx — but we
// keep them isolated because the metronome uses square blips and this uses
// a filtered sawtooth. Both obey user-gesture activation: priming happens on
// the first Play button press via `primeAudio()`.

import type { ChordShape, TabNote, Finger } from '../music/types';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function getCtx(): { ctx: AudioContext; master: GainNode } {
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.32;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
  return { ctx, master: master! };
}

// Standard tuning, in Hz — index 0 = string 6 (low E), index 5 = string 1 (high e).
const OPEN_FREQ: Record<number, number> = {
  6: 82.407,   // E2
  5: 110.000,  // A2
  4: 146.832,  // D3
  3: 195.998,  // G3
  2: 246.942,  // B3
  1: 329.628,  // E4
};

function noteFreq(stringNum: number, fret: number): number {
  const base = OPEN_FREQ[stringNum];
  return base * 2 ** (fret / 12);
}

export function setMasterVolume(vol: number): void {
  const { master: m } = getCtx();
  m.gain.setTargetAtTime(Math.max(0, Math.min(1, vol)), (ctx as AudioContext).currentTime, 0.02);
}

interface PluckOpts {
  /** When in seconds (AudioContext time) to trigger the note. */
  when?: number;
  /** Gain envelope peak, 0..1. */
  gain?: number;
  /** Sustain time in seconds before release. */
  sustain?: number;
}

export function pluck(stringNum: number, fret: number, opts: PluckOpts = {}): void {
  const { ctx: audio, master: out } = getCtx();
  const when = opts.when ?? audio.currentTime;
  const gain = opts.gain ?? 0.55;
  const sustain = opts.sustain ?? 0.9;

  const freq = noteFreq(stringNum, fret);

  // Oscillators — fundamental (sawtooth) + a triangle one octave up for shimmer.
  const osc1 = audio.createOscillator();
  osc1.type = 'sawtooth';
  osc1.frequency.value = freq;

  const osc2 = audio.createOscillator();
  osc2.type = 'triangle';
  osc2.frequency.value = freq * 2;

  // Lowpass filter sweep — simulates the bright-to-mellow pluck decay.
  const filter = audio.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(Math.min(freq * 18, 8000), when);
  filter.frequency.exponentialRampToValueAtTime(Math.max(freq * 2, 220), when + sustain);

  // Gain envelope — fast attack, exponential decay.
  const env = audio.createGain();
  env.gain.setValueAtTime(0.0001, when);
  env.gain.exponentialRampToValueAtTime(gain, when + 0.005);
  env.gain.exponentialRampToValueAtTime(0.0001, when + sustain);

  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(env).connect(out);

  osc1.start(when);
  osc2.start(when);
  osc1.stop(when + sustain + 0.05);
  osc2.stop(when + sustain + 0.05);
}

/** Strum a chord — notes fire sequentially across strings to imitate a pick stroke. */
export function strum(chord: ChordShape, opts: { direction?: 'down' | 'up'; when?: number; spread?: number; gain?: number } = {}): void {
  const { ctx: audio } = getCtx();
  const direction = opts.direction ?? 'down';
  const spread = opts.spread ?? 0.015; // seconds between adjacent strings
  const when0 = opts.when ?? audio.currentTime;
  const startFret = chord.startFret ?? 1;

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
  sequence.forEach((stringNum, i) => {
    const v = voicings.get(stringNum)!;
    pluck(stringNum, v.fret, {
      when: when0 + i * spread,
      gain: opts.gain ?? 0.5,
      sustain: 1.4,
    });
  });
}

/** Play a single tab note (used in lead mode). */
export function playTabNote(n: TabNote, opts: { when?: number; gain?: number } = {}): void {
  if (typeof n.fret !== 'number') return;
  pluck(n.string, n.fret, { when: opts.when, gain: opts.gain ?? 0.6, sustain: 0.75 });
}
