// AudioTrack — plays a real recorded audio file alongside the synth-driven
// chord/tab timeline. The Transport stays master; this module follows it via
// explicit play/pause/seek calls plus a drift-watchdog that re-seeks when the
// media element and the expected position disagree by more than 50 ms.

const ONSET_THRESHOLD = 0.05;
const SILENCE_THRESHOLD = 0.02;
const SILENCE_HOLD_MS = 200;
const ENVELOPE_TAU_MS = 8;

export function findFirstOnset(samples: Float32Array, sampleRate: number): number {
  if (samples.length === 0) return 0;
  const frameSize = 256;
  const frameMs = (frameSize / sampleRate) * 1000;
  const alpha = 1 - Math.exp(-frameMs / ENVELOPE_TAU_MS);
  let env = 0;
  let prevEnv = 0;
  const silentFramesNeeded = Math.ceil(SILENCE_HOLD_MS / frameMs);
  let silentFrames = silentFramesNeeded;

  for (let start = 0; start < samples.length; start += frameSize) {
    let peak = 0;
    const end = Math.min(start + frameSize, samples.length);
    for (let i = start; i < end; i++) {
      const v = samples[i];
      const abs = v < 0 ? -v : v;
      if (abs > peak) peak = abs;
    }
    prevEnv = env;
    env = env + alpha * (peak - env);

    if (env < SILENCE_THRESHOLD) {
      silentFrames++;
    } else {
      if (
        silentFrames >= silentFramesNeeded &&
        prevEnv <= ONSET_THRESHOLD &&
        env > ONSET_THRESHOLD
      ) {
        return start / sampleRate;
      }
      silentFrames = 0;
    }
  }
  return 0;
}

/**
 * Decode the first 15 seconds of an audio file into a mono Float32Array and
 * run `findFirstOnset` on it. Used on attach to auto-pick beat 1.
 *
 * Uses `OfflineAudioContext` for decoding — browser-only, does not run in
 * Vitest's jsdom. Unit tests cover `findFirstOnset`; this wrapper is tested
 * by hand via the import dialog.
 */
export async function detectBeatOneFromArrayBuffer(buf: ArrayBuffer): Promise<number> {
  if (typeof OfflineAudioContext === 'undefined') return 0;
  const targetSec = 15;
  const sampleRate = 44100;
  const ctx = new OfflineAudioContext(1, Math.floor(targetSec * sampleRate), sampleRate);
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(buf.slice(0));
  } catch {
    return 0;
  }

  const channels = decoded.numberOfChannels;
  const len = Math.min(decoded.length, Math.floor(targetSec * decoded.sampleRate));
  const mono = new Float32Array(len);
  for (let ch = 0; ch < channels; ch++) {
    const data = decoded.getChannelData(ch);
    for (let i = 0; i < len; i++) mono[i] += data[i] / channels;
  }
  return findFirstOnset(mono, decoded.sampleRate);
}

export interface AudioTrackOpts {
  audioContext: AudioContext;
  onEnded?: () => void;
  onError?: (message: string) => void;
  /** Test-only: inject a stand-in for the HTMLAudioElement. */
  audioElForTests?: HTMLAudioElement;
}

export class AudioTrack {
  private readonly audioEl: HTMLAudioElement;
  private readonly ctx: AudioContext;
  private source: MediaElementAudioSourceNode | null = null;
  private gain: GainNode;
  private muted = false;
  private driftTimer: ReturnType<typeof setInterval> | null = null;
  private expectedStartSec = 0;
  private expectedStartedAt = 0;
  private tempoScale = 1;

  constructor(opts: AudioTrackOpts) {
    this.ctx = opts.audioContext;
    this.audioEl = opts.audioElForTests ?? new Audio();
    this.audioEl.crossOrigin = 'anonymous';
    this.audioEl.preload = 'auto';
    (this.audioEl as HTMLMediaElement & { preservesPitch?: boolean }).preservesPitch = true;

    this.gain = this.ctx.createGain();
    this.gain.gain.value = 1;
    this.gain.connect(this.ctx.destination);

    this.audioEl.addEventListener('ended', () => opts.onEnded?.());
    this.audioEl.addEventListener('error', () => {
      const err = this.audioEl.error;
      opts.onError?.(err ? `audio error ${err.code}` : 'audio error');
    });
  }

  async load(url: string): Promise<{ durationSec: number }> {
    this.audioEl.src = url;
    await new Promise<void>((resolve, reject) => {
      const onMeta = () => {
        this.audioEl.removeEventListener('loadedmetadata', onMeta);
        this.audioEl.removeEventListener('error', onErr);
        resolve();
      };
      const onErr = () => {
        this.audioEl.removeEventListener('loadedmetadata', onMeta);
        this.audioEl.removeEventListener('error', onErr);
        reject(new Error('audio load failed'));
      };
      this.audioEl.addEventListener('loadedmetadata', onMeta);
      this.audioEl.addEventListener('error', onErr);
    });

    if (!this.source) {
      this.source = this.ctx.createMediaElementSource(this.audioEl);
      this.source.connect(this.gain);
    }

    return { durationSec: this.audioEl.duration };
  }

  isLoaded(): boolean {
    return !!this.source;
  }

  mute(value: boolean): void {
    this.muted = value;
    this.gain.gain.value = value ? 0 : 1;
  }

  isMuted(): boolean {
    return this.muted;
  }

  async seekToBeat(beat: number, bpm: number, offsetSec: number): Promise<void> {
    const audioTime = offsetSec + (beat * 60) / bpm;
    const dur = this.audioEl.duration;
    const clamped = Number.isFinite(dur) && dur > 0 ? Math.max(0, Math.min(dur - 0.01, audioTime)) : Math.max(0, audioTime);
    await this.fadeAround(() => {
      this.audioEl.currentTime = clamped;
    });
  }

  async play(beat: number, bpm: number, offsetSec: number, tempoScale: number): Promise<void> {
    this.setTempoScale(tempoScale);
    await this.seekToBeat(beat, bpm, offsetSec);
    this.expectedStartSec = this.audioEl.currentTime;
    this.expectedStartedAt = performance.now();
    await this.audioEl.play();
    this.startDriftWatch();
  }

  pause(): void {
    this.audioEl.pause();
    this.stopDriftWatch();
  }

  setTempoScale(scale: number): void {
    this.tempoScale = scale;
    this.audioEl.playbackRate = scale;
  }

  dispose(): void {
    this.stopDriftWatch();
    try {
      this.audioEl.pause();
      this.audioEl.removeAttribute('src');
      this.audioEl.load();
    } catch {
      /* ignore */
    }
  }

  /** 10 ms gain ramp down → run `mutator` exactly at the end of the fade → 10 ms ramp up. */
  private async fadeAround(mutator: () => void): Promise<void> {
    const now = this.ctx.currentTime;
    const fadeDur = 0.012;
    const target = this.muted ? 0 : 1;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(this.gain.gain.value, now);
    this.gain.gain.linearRampToValueAtTime(0, now + fadeDur);
    // Schedule a zero-duration ConstantSourceNode that fires `onended` at
    // exactly `now + fadeDur`, so the mutator runs when the audio clock has
    // completed the ramp — not ~1 render frame early or late as setTimeout would.
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        resolve();
      };
      try {
        const src = this.ctx.createConstantSource();
        src.onended = () => finish();
        src.start(now);
        src.stop(now + fadeDur);
      } catch {
        // ConstantSourceNode not available (very old stacks) — fall back to setTimeout.
        setTimeout(finish, Math.max(1, Math.ceil(fadeDur * 1000) + 2));
      }
      // Hard safety fallback in case onended never fires.
      setTimeout(finish, Math.max(1, Math.ceil(fadeDur * 1000) + 30));
    });
    mutator();
    const after = this.ctx.currentTime;
    this.gain.gain.setValueAtTime(0, after);
    this.gain.gain.linearRampToValueAtTime(target, after + fadeDur);
  }

  // --- Drift control ---
  // Small drift (<150 ms): nudge playbackRate for 400 ms so the media element
  // catches up without a seek click. Large drift: fall back to hard seek + fade.
  private rateHoldUntil = 0;
  private readonly SMALL_DRIFT_SEC = 0.15;
  private readonly RATE_NUDGE_HOLD_MS = 400;
  private readonly RATE_NUDGE_MAX = 0.03; // ±3%

  /** Exposed for tests — returns which branch a given drift value would take. */
  classifyDrift(driftSec: number): 'none' | 'rate-nudge' | 'hard-seek' {
    const abs = Math.abs(driftSec);
    if (abs <= 0.01) return 'none';
    if (abs < this.SMALL_DRIFT_SEC) return 'rate-nudge';
    return 'hard-seek';
  }

  private applyRateNudge(driftSec: number): void {
    // Positive drift = audio ahead of expected → slow down (rate < tempoScale).
    // Negative drift = audio behind → speed up (rate > tempoScale).
    const factor = 1 - (0.6 * driftSec) / this.SMALL_DRIFT_SEC;
    const clamped = Math.max(1 - this.RATE_NUDGE_MAX, Math.min(1 + this.RATE_NUDGE_MAX, factor));
    this.audioEl.playbackRate = this.tempoScale * clamped;
    this.rateHoldUntil = performance.now() + this.RATE_NUDGE_HOLD_MS;
  }

  /**
   * Runs one drift-watch step against the given wall clock and measured audio
   * position. Returns the branch taken so tests can assert without racing a
   * real setInterval.
   */
  _driftStepForTests(nowMs: number, actualSec: number): 'none' | 'rate-nudge' | 'hard-seek' | 'paused' {
    if (this.audioEl.paused) return 'paused';
    const elapsedSec = ((nowMs - this.expectedStartedAt) / 1000) * this.tempoScale;
    const expected = this.expectedStartSec + elapsedSec;
    const drift = actualSec - expected;
    const mode = this.classifyDrift(drift);

    if (mode === 'hard-seek') {
      void this.fadeAround(() => {
        this.audioEl.currentTime = Math.max(0, expected);
      });
      this.expectedStartedAt = nowMs;
      this.expectedStartSec = expected;
      this.audioEl.playbackRate = this.tempoScale;
      this.rateHoldUntil = 0;
    } else if (mode === 'rate-nudge') {
      this.applyRateNudge(drift);
    } else if (mode === 'none' && nowMs >= this.rateHoldUntil && this.audioEl.playbackRate !== this.tempoScale) {
      this.audioEl.playbackRate = this.tempoScale;
    }
    return mode;
  }

  private startDriftWatch(): void {
    this.stopDriftWatch();
    this.driftTimer = setInterval(() => {
      this._driftStepForTests(performance.now(), this.audioEl.currentTime);
    }, 500);
  }

  private stopDriftWatch(): void {
    if (this.driftTimer) {
      clearInterval(this.driftTimer);
      this.driftTimer = null;
    }
  }
}
