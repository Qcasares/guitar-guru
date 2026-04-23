// BPM-driven beat clock. Two emitters run side by side:
//
//   rAF loop  → onTick (every frame, carries beat + phase)
//              → onBeat (once per integer beat; drives voice/haptics/UI)
//   Scheduler → onAudioBeat (once per integer beat, with an audio-clock `when`;
//                            drives synth strums, metronome clicks, tab notes,
//                            finger cues — anything that must land
//                            sample-accurately on the audio clock)
//
// The rAF path is the visual source of truth and has always existed. The
// scheduler path is optional — Transport wires it up only when both
// `audioCtx` and `onAudioBeat` are provided. Both are anchored at the same
// play() moment, so they stay phase-aligned to within one audio callback.

import { BeatScheduler } from './scheduler';

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
  /** Fires for each integer beat with an audio-clock `when` for sample-accurate scheduling. */
  onAudioBeat?: (beat: number, when: number) => void;
  /** When provided with `onAudioBeat`, a BeatScheduler runs against this context. */
  audioCtx?: AudioContext;
};

export class Transport {
  private raf = 0;
  private startedAt = 0;
  private startBeat = 0;
  private playing = false;
  private lastBeat = -1;
  private opts: TransportOpts;
  private scheduler: BeatScheduler | null = null;

  constructor(opts: TransportOpts) {
    this.opts = opts;
    this.buildScheduler();
  }

  update(patch: Partial<TransportOpts>): void {
    const prev = this.opts;
    this.opts = { ...prev, ...patch };
    if (this.scheduler) {
      // Propagate tempo / loop / length changes to the audio scheduler so it
      // stays aligned with the rAF clock.
      this.scheduler.update({
        bpm: this.opts.bpm,
        tempoScale: this.opts.tempoScale,
        totalBeats: this.opts.totalBeats,
        loop: this.opts.loop,
      });
    }
    // If onAudioBeat or audioCtx changed, rebuild the scheduler.
    if (patch.onAudioBeat !== undefined || patch.audioCtx !== undefined) {
      const wasRunning = this.scheduler?.isRunning() ?? false;
      const currentBeat = wasRunning ? this.currentBeat() : this.startBeat;
      this.scheduler?.stop();
      this.scheduler = null;
      this.buildScheduler();
      const rebuilt = this.scheduler as BeatScheduler | null;
      if (wasRunning && rebuilt) {
        rebuilt.start({
          startBeat: currentBeat,
          bpm: this.opts.bpm,
          tempoScale: this.opts.tempoScale,
          totalBeats: this.opts.totalBeats,
          loop: this.opts.loop,
        });
      }
    }
  }

  play(): void {
    if (this.playing) return;
    this.playing = true;
    this.startedAt = performance.now();
    this.scheduler?.start({
      startBeat: this.startBeat,
      bpm: this.opts.bpm,
      tempoScale: this.opts.tempoScale,
      totalBeats: this.opts.totalBeats,
      loop: this.opts.loop,
    });
    this.loop();
  }

  pause(): void {
    if (!this.playing) return;
    this.playing = false;
    this.startBeat = this.currentBeat();
    cancelAnimationFrame(this.raf);
    this.scheduler?.stop();
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
    if (this.playing) {
      this.opts.onBeat(Math.floor(clamped));
      this.scheduler?.seek(clamped);
    } else {
      this.scheduler?.seek(clamped);
    }
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
    this.scheduler?.stop();
    this.scheduler = null;
  }

  private buildScheduler(): void {
    const { audioCtx, onAudioBeat } = this.opts;
    if (!audioCtx || !onAudioBeat) return;
    this.scheduler = new BeatScheduler({
      ctx: audioCtx,
      onBeat: (beat, when) => this.opts.onAudioBeat?.(beat, when),
      onStop: () => {
        // End-of-song: rAF path will also see totalBeats cross and stop UI;
        // the scheduler just tears itself down so no more audio fires past end.
      },
    });
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
      this.scheduler?.stop();
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
