// Lightweight transient/strum onset detection.
//
// A full onset detector would use spectral flux or high-frequency content;
// for a practice app we just need to know *when* the player hit a string,
// not exactly which string. A plain high-pass + amplitude-envelope rise
// detector with a refractory window is plenty and costs almost nothing.

export interface OnsetDetectorOptions {
  /** Minimum gap between detected onsets, in ms (prevents one strum counting as several). */
  refractoryMs?: number;
  /** Absolute amplitude envelope threshold (0..1) that must be crossed to fire. */
  threshold?: number;
  /** Envelope smoothing time constant in ms. Smaller = more sensitive to transients. */
  envelopeTauMs?: number;
}

/**
 * Stateful detector. Feed it raw time-domain buffers at whatever rate
 * AudioInput emits them; it emits an onset callback each time the envelope
 * crosses the threshold on the way up, subject to the refractory window.
 */
export class OnsetDetector {
  private envelope = 0;
  private prevEnvelope = 0;
  private lastOnsetAt = 0;
  private readonly refractoryMs: number;
  private readonly threshold: number;
  private readonly envelopeTauMs: number;

  constructor(opts: OnsetDetectorOptions = {}) {
    this.refractoryMs = opts.refractoryMs ?? 80;
    this.threshold = opts.threshold ?? 0.05;
    this.envelopeTauMs = opts.envelopeTauMs ?? 8;
  }

  reset(): void {
    this.envelope = 0;
    this.prevEnvelope = 0;
    this.lastOnsetAt = 0;
  }

  /**
   * Feed one time-domain frame. Returns true if an onset fired on this frame.
   * `now` is the high-resolution timestamp for the frame (performance.now()).
   */
  process(buf: Float32Array, sampleRate: number, now: number): boolean {
    // Rectified peak of the frame — simple energy proxy.
    let peak = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = buf[i];
      const abs = v < 0 ? -v : v;
      if (abs > peak) peak = abs;
    }

    // One-pole envelope follower. Time constant applied over the frame duration.
    const frameMs = (buf.length / sampleRate) * 1000;
    const alpha = 1 - Math.exp(-frameMs / this.envelopeTauMs);
    this.prevEnvelope = this.envelope;
    this.envelope = this.envelope + alpha * (peak - this.envelope);

    const rose = this.envelope > this.threshold && this.prevEnvelope <= this.threshold;
    if (!rose) return false;
    if (now - this.lastOnsetAt < this.refractoryMs) return false;

    this.lastOnsetAt = now;
    return true;
  }
}

/**
 * Compute how close an onset was to an expected beat time.
 * Returns `{ offsetMs, within }` where `within` is true iff within tolerance.
 */
export function scoreOnsetTiming(
  onsetAt: number,
  expectedAt: number,
  toleranceMs: number,
): { offsetMs: number; within: boolean } {
  const offsetMs = onsetAt - expectedAt;
  return { offsetMs, within: Math.abs(offsetMs) <= toleranceMs };
}
