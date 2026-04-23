// BeatScheduler — Chris Wilson-style look-ahead clock.
//
// Runs on `setInterval(25 ms)` and emits every integer beat whose scheduled
// `when` falls within `lookaheadSec` of `ctx.currentTime`. Callers schedule
// Web Audio events at `when` so they land sample-accurately regardless of how
// much JS jitter sits between this tick and the audio callback.
//
// Behavior mirrors `Transport.loop`:
//   - anchor resets on play, seek, bpm / tempoScale change
//   - loop wrap: when nextBeat reaches loop.toBeat, re-anchor at loop.fromBeat
//   - totalBeats stop: stop cleanly at `totalBeats` and call `onStop()`

export interface SchedulerLoop {
  fromBeat: number;
  toBeat: number;
}

/** Turns JS's signed negative zero (-0) into a regular +0 so assertions behave. */
function normalizeBeat(n: number): number {
  return n === 0 ? 0 : n;
}

export interface BeatSchedulerOpts {
  ctx: AudioContext;
  onBeat: (beat: number, when: number) => void;
  onStop?: () => void;
  lookaheadSec?: number;
  tickMs?: number;
}

export interface SchedulerStartParams {
  startBeat: number;
  bpm: number;
  tempoScale: number;
  totalBeats: number;
  loop: SchedulerLoop | null;
}

export class BeatScheduler {
  private readonly ctx: AudioContext;
  private readonly onBeat: (beat: number, when: number) => void;
  private readonly onStop?: () => void;
  private readonly lookaheadSec: number;
  private readonly tickMs: number;

  private timer: ReturnType<typeof setInterval> | null = null;
  private anchorCtxTime = 0;
  private anchorBeat = 0;
  private nextBeat = 0;
  private bpm = 120;
  private tempoScale = 1;
  private totalBeats = 0;
  private loop: SchedulerLoop | null = null;
  // Lets the very first synchronous tick() inside start() run before the
  // setInterval timer has been registered, preventing a short dead zone.
  private firstTick = true;

  constructor(opts: BeatSchedulerOpts) {
    this.ctx = opts.ctx;
    this.onBeat = opts.onBeat;
    this.onStop = opts.onStop;
    this.lookaheadSec = opts.lookaheadSec ?? 0.1;
    this.tickMs = opts.tickMs ?? 25;
  }

  /** Called for side effect from tests. */
  private now(): number {
    return this.ctx.currentTime;
  }

  private beatsPerSec(): number {
    return (this.bpm * this.tempoScale) / 60;
  }

  /** ctx time at which beat `b` is scheduled, using the current anchor. */
  private timeOfBeat(b: number): number {
    return this.anchorCtxTime + (b - this.anchorBeat) / this.beatsPerSec();
  }

  /** Re-anchor so that `now` maps to the given beat, preserving continuity. */
  private reanchorAt(nowCtxTime: number, beatAtNow: number): void {
    this.anchorCtxTime = nowCtxTime;
    this.anchorBeat = beatAtNow;
  }

  start(p: SchedulerStartParams): void {
    this.stop();
    this.bpm = p.bpm;
    this.tempoScale = p.tempoScale;
    this.totalBeats = p.totalBeats;
    this.loop = p.loop;
    this.anchorBeat = p.startBeat;
    // Small forward offset so the very first beat is schedulable even if
    // start() lands a hair after the audio callback has advanced.
    this.anchorCtxTime = this.now() + 0.02;
    this.nextBeat = normalizeBeat(Math.ceil(p.startBeat - 1e-6));
    this.firstTick = true;
    this.tick();
    this.timer = setInterval(this.tick, this.tickMs);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  isRunning(): boolean {
    return this.timer !== null;
  }

  update(patch: Partial<Pick<SchedulerStartParams, 'bpm' | 'tempoScale' | 'totalBeats' | 'loop'>>): void {
    if (patch.bpm !== undefined || patch.tempoScale !== undefined) {
      // Re-anchor to preserve the current beat position when tempo changes.
      if (this.timer !== null) {
        const t = this.now();
        const currentBeat = this.anchorBeat + (t - this.anchorCtxTime) * this.beatsPerSec();
        this.bpm = patch.bpm ?? this.bpm;
        this.tempoScale = patch.tempoScale ?? this.tempoScale;
        this.reanchorAt(t, currentBeat);
        this.nextBeat = normalizeBeat(Math.ceil(currentBeat - 1e-6));
      } else {
        this.bpm = patch.bpm ?? this.bpm;
        this.tempoScale = patch.tempoScale ?? this.tempoScale;
      }
    }
    if (patch.totalBeats !== undefined) this.totalBeats = patch.totalBeats;
    if (patch.loop !== undefined) this.loop = patch.loop;
  }

  seek(beat: number): void {
    if (this.timer !== null) {
      this.anchorCtxTime = this.now() + 0.02;
      this.anchorBeat = beat;
      this.nextBeat = normalizeBeat(Math.ceil(beat - 1e-6));
    } else {
      this.anchorBeat = beat;
      this.nextBeat = normalizeBeat(Math.ceil(beat - 1e-6));
    }
  }

  /** Exposed for tests: step the scheduler manually. */
  tickNow(): void {
    this.tick();
  }

  private tick = (): void => {
    if (this.timer === null && !this.firstTick) return;
    this.firstTick = false;

    const horizon = this.now() + this.lookaheadSec;
    // Safety cap to avoid runaway loops if tempo or anchor is degenerate.
    let guard = 2048;

    while (guard-- > 0) {
      // Did we hit the hard end of song?
      if (this.totalBeats > 0 && this.nextBeat >= this.totalBeats) {
        this.stop();
        this.onStop?.();
        return;
      }

      // Did we hit the loop's end? Re-anchor at loop.fromBeat.
      if (this.loop && this.nextBeat >= this.loop.toBeat) {
        const crossedAt = this.timeOfBeat(this.loop.toBeat);
        this.reanchorAt(crossedAt, this.loop.fromBeat);
        this.nextBeat = normalizeBeat(Math.ceil(this.loop.fromBeat - 1e-6));
        continue;
      }

      const when = this.timeOfBeat(this.nextBeat);
      if (when > horizon) return;

      // Don't schedule events in the past (e.g. first tick after a long JS stall).
      const safeWhen = Math.max(when, this.now());
      this.onBeat(this.nextBeat, safeWhen);
      this.nextBeat += 1;
    }
  };
}
