import { describe, expect, it } from 'vitest';
import { findFirstOnset } from '../audio-track';

/** Generate silence + a single 20ms triangle-ramp "click" at `clickAtSec`. */
function makeClickSamples(durationSec: number, sampleRate: number, clickAtSec: number): Float32Array {
  const total = Math.floor(durationSec * sampleRate);
  const buf = new Float32Array(total);
  const clickStart = Math.floor(clickAtSec * sampleRate);
  const clickLen = Math.floor(0.02 * sampleRate);
  for (let i = 0; i < clickLen && clickStart + i < total; i++) {
    const t = i / clickLen;
    const env = t < 0.5 ? t * 2 : (1 - t) * 2;
    buf[clickStart + i] = env;
  }
  return buf;
}

describe('findFirstOnset', () => {
  const SR = 44100;

  it('finds an onset at ~1.0s', () => {
    const samples = makeClickSamples(3, SR, 1.0);
    const t = findFirstOnset(samples, SR);
    expect(t).toBeGreaterThan(0.9);
    expect(t).toBeLessThan(1.1);
  });

  it('finds an onset at the very start when there is no silence lead-in', () => {
    const samples = makeClickSamples(3, SR, 0.0);
    const t = findFirstOnset(samples, SR);
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThan(0.1);
  });

  it('returns 0 when nothing is above threshold', () => {
    const samples = new Float32Array(SR * 2);
    const t = findFirstOnset(samples, SR);
    expect(t).toBe(0);
  });

  it('finds onset after a noisy lead-in once envelope drops', () => {
    // Noise floor at ~0.01 for 1.5s, then a 0.5 peak. The silence-exit rule
    // runs on the smoothed envelope — 0.01 peaks smooth to well below 0.02,
    // satisfying the silence hold; the onset at 1.5s should be found.
    const samples = new Float32Array(SR * 3);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = 0.01 * Math.sin(i * 0.1);
    }
    const peakStart = Math.floor(1.5 * SR);
    for (let i = 0; i < 0.02 * SR; i++) {
      samples[peakStart + i] = 0.5;
    }
    const t = findFirstOnset(samples, SR);
    expect(t).toBeGreaterThan(1.4);
    expect(t).toBeLessThan(1.6);
  });
});
