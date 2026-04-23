import type { Finger } from '../music/types';
import { getSharedCtx } from './audio-context';

/**
 * Finger sonification — accessible audio cue per fretting finger.
 *
 * Low-vision and colour-blind players can't always distinguish the finger
 * colours painted on the fretboard (1=red, 2=blue, 3=green, 4=orange, T=purple).
 * This module maps each finger to a distinct pitch drawn from a rising
 * C-major pentatonic-ish sequence so fingers feel ordered by ear, and can
 * be layered under chord narration or the metronome without masking them.
 */

const FINGER_HZ: Record<Finger, number> = {
  T: 220.0,
  1: 261.63,
  2: 329.63,
  3: 392.0,
  4: 523.25,
};

/** Idempotent — ensures the shared AudioContext is built and running. */
export function primeFingerAudio(): void {
  getSharedCtx();
}

/**
 * Fire a short pitched pluck for the given finger.
 *
 * @param finger - Fretting finger identifier (`1`-`4` or `'T'` for thumb).
 * @param opts   - `when` overrides the scheduled start (AudioContext time, seconds);
 *                 `gain` overrides the peak amplitude (default 0.25).
 */
export function playFingerCue(
  finger: Finger,
  opts?: { when?: number; gain?: number },
): void {
  const { ctx, master } = getSharedCtx();
  const when = opts?.when ?? ctx.currentTime;
  const peak = opts?.gain ?? 0.25;
  const freq = FINGER_HZ[finger];

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = freq;

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, when);
  amp.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), when + 0.005);
  amp.gain.exponentialRampToValueAtTime(0.0001, when + 0.155);

  osc.connect(amp);
  amp.connect(master);
  osc.start(when);
  osc.stop(when + 0.2);
}
