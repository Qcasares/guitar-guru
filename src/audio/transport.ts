// A tiny BPM-driven beat clock. Emits integer beat indices (0, 1, 2, …) to a
// subscriber, scheduled via requestAnimationFrame against performance.now() so
// it stays in sync with the browser's render loop regardless of tab throttling.

export type TransportState = {
  playing: boolean;
  /** Absolute beat index since play start (integer ticks only, no fractional drift). */
  beat: number;
  /** Fractional beat within the *current* beat [0, 1). Useful for animating the playhead. */
  beatPhase: number;
};

export type TransportOpts = {
  bpm: number;
  tempoScale: number; // 0.5 = half-speed, 1 = normal
  totalBeats: number;
  loop: { fromBeat: number; toBeat: number } | null;
  onTick: (state: TransportState) => void;
  onBeat: (beat: number) => void;
};

export class Transport {
  private raf = 0;
  private startedAt = 0;
  private startBeat = 0;
  private playing = false;
  private lastBeat = -1;
  private opts: TransportOpts;

  constructor(opts: TransportOpts) {
    this.opts = opts;
  }

  update(patch: Partial<TransportOpts>): void {
    this.opts = { ...this.opts, ...patch };
  }

  play(): void {
    if (this.playing) return;
    this.playing = true;
    this.startedAt = performance.now();
    this.loop();
  }

  pause(): void {
    if (!this.playing) return;
    this.playing = false;
    this.startBeat = this.currentBeat();
    cancelAnimationFrame(this.raf);
    this.opts.onTick({ playing: false, beat: Math.floor(this.startBeat), beatPhase: this.startBeat % 1 });
  }

  toggle(): void {
    this.playing ? this.pause() : this.play();
  }

  seek(beat: number): void {
    const clamped = Math.max(0, Math.min(this.opts.totalBeats - 0.0001, beat));
    this.startBeat = clamped;
    this.startedAt = performance.now();
    this.lastBeat = Math.floor(clamped) - 1;
    this.opts.onTick({ playing: this.playing, beat: Math.floor(clamped), beatPhase: clamped % 1 });
    if (this.playing) this.opts.onBeat(Math.floor(clamped));
  }

  /** Jump by an integer bar delta from the current position, snapping to the bar start. */
  seekBars(deltaBars: number, beatsPerBar: number): void {
    const currentBar = Math.floor(this.currentBeat() / beatsPerBar);
    const targetBar = currentBar + deltaBars;
    this.seek(targetBar * beatsPerBar);
  }

  isPlaying(): boolean {
    return this.playing;
  }

  dispose(): void {
    this.playing = false;
    cancelAnimationFrame(this.raf);
  }

  private currentBeat(): number {
    if (!this.playing) return this.startBeat;
    const elapsedMs = performance.now() - this.startedAt;
    const beatsPerMs = (this.opts.bpm * this.opts.tempoScale) / 60_000;
    return this.startBeat + elapsedMs * beatsPerMs;
  }

  private loop = (): void => {
    if (!this.playing) return;
    let beatPos = this.currentBeat();

    // Loop handling — wrap back to fromBeat if we crossed toBeat.
    const { loop, totalBeats, onBeat, onTick } = this.opts;
    if (loop && beatPos >= loop.toBeat) {
      const overshoot = beatPos - loop.toBeat;
      beatPos = loop.fromBeat + overshoot;
      this.startBeat = beatPos;
      this.startedAt = performance.now();
      this.lastBeat = Math.floor(beatPos) - 1;
    } else if (beatPos >= totalBeats) {
      // End of song — stop cleanly.
      this.playing = false;
      onTick({ playing: false, beat: totalBeats - 1, beatPhase: 0 });
      return;
    }

    const intBeat = Math.floor(beatPos);
    if (intBeat !== this.lastBeat) {
      this.lastBeat = intBeat;
      onBeat(intBeat);
    }
    onTick({ playing: true, beat: intBeat, beatPhase: beatPos - intBeat });
    this.raf = requestAnimationFrame(this.loop);
  };
}
