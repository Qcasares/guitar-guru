// Polyphonic chord recognition via chromagram + template matching.
//
// For each FFT bin we convert the bin frequency to its nearest pitch class
// (0=C … 11=B), accumulate the linear magnitude into that slot, and match
// the resulting 12-vector against hand-tuned chord templates.
//
// This is intentionally simple — production-grade recognizers use HPCP or
// neural nets. For a practice app that only cares about the 12 chords in
// `CHORD_LIB`, template matching lands well within usable accuracy.

const PITCH_CLASS_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function freqToPitchClass(freq: number): number {
  if (freq <= 0) return -1;
  // A4 = 440 Hz = MIDI 69, pitch class 9.
  const midi = 69 + 12 * Math.log2(freq / 440);
  return ((Math.round(midi) % 12) + 12) % 12;
}

/**
 * Build a normalized chroma vector from an FFT magnitude frame (dBFS).
 * Only guitar-range bins (80–1200 Hz ≈ E2–D6) contribute.
 */
export function chromagram(freqData: Float32Array, sampleRate: number, fftSize: number): number[] {
  const chroma = new Array<number>(12).fill(0);
  const binHz = sampleRate / fftSize;
  const minBin = Math.max(1, Math.floor(80 / binHz));
  const maxBin = Math.min(freqData.length - 1, Math.floor(1200 / binHz));

  for (let b = minBin; b <= maxBin; b++) {
    const db = freqData[b];
    if (!Number.isFinite(db) || db < -70) continue; // skip near-silent bins
    const mag = Math.pow(10, db / 20);
    const pc = freqToPitchClass(b * binHz);
    if (pc >= 0) chroma[pc] += mag;
  }
  const max = chroma.reduce((m, v) => (v > m ? v : m), 0);
  if (max > 0) for (let i = 0; i < 12; i++) chroma[i] /= max;
  return chroma;
}

/**
 * Chord templates — pitch-class sets for each shape in the app's CHORD_LIB.
 * (Matches the set in `src/music/chords.ts` so detection can auto-advance
 * over any chord the user has imported.)
 */
const CHORD_TEMPLATES: Record<string, number[]> = {
  C:  [0, 4, 7],
  D:  [2, 6, 9],
  Dm: [2, 5, 9],
  D7: [2, 6, 9, 0],
  E:  [4, 8, 11],
  Em: [4, 7, 11],
  F:  [5, 9, 0],
  G:  [7, 11, 2],
  G7: [7, 11, 2, 5],
  A:  [9, 1, 4],
  Am: [9, 0, 4],
  Bm: [11, 2, 6],
};

export interface ChordMatch {
  chord: string;
  /** 0..1 — how well the chroma vector matches this chord vs. its complement. */
  score: number;
}

export function matchChord(chroma: number[]): ChordMatch | null {
  let best: ChordMatch | null = null;
  for (const [name, template] of Object.entries(CHORD_TEMPLATES)) {
    let inSum = 0;
    for (const pc of template) inSum += chroma[pc];
    let outSum = 0;
    for (let pc = 0; pc < 12; pc++) {
      if (!template.includes(pc)) outSum += chroma[pc];
    }
    const score = inSum / template.length - outSum / (12 - template.length);
    if (!best || score > best.score) best = { chord: name, score };
  }
  if (!best || best.score < 0.15) return null;
  return best;
}

export function detectChord(freqData: Float32Array, sampleRate: number, fftSize: number): ChordMatch | null {
  const chroma = chromagram(freqData, sampleRate, fftSize);
  return matchChord(chroma);
}

/** Pitch-class name for a chroma peak, handy for UI debug. */
export function dominantPitchClass(chroma: number[]): string {
  let best = 0;
  for (let i = 1; i < 12; i++) if (chroma[i] > chroma[best]) best = i;
  return PITCH_CLASS_NAMES[best];
}
