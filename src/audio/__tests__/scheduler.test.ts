import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { BeatScheduler } from '../scheduler';

/** Minimal AudioContext stand-in — only `currentTime` is read by the scheduler. */
class MockCtx {
  currentTime = 0;
  advance(dt: number): void {
    this.currentTime += dt;
  }
}

describe('BeatScheduler', () => {
  let ctx: MockCtx;

  beforeEach(() => {
    vi.useFakeTimers();
    ctx = new MockCtx();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires one onBeat per integer beat with a scheduled `when` in the future', () => {
    const onBeat = vi.fn();
    const s = new BeatScheduler({
      ctx: ctx as unknown as AudioContext,
      onBeat,
      lookaheadSec: 0.1,
      tickMs: 25,
    });
    // 120 BPM, so one beat every 0.5 s.
    s.start({ startBeat: 0, bpm: 120, tempoScale: 1, totalBeats: 16, loop: null });

    // Synchronous first tick inside start(): beat 0 is within lookahead.
    expect(onBeat).toHaveBeenCalledTimes(1);
    const [b0, when0] = onBeat.mock.calls[0];
    expect(b0).toBe(0);
    expect(when0).toBeGreaterThanOrEqual(0);

    // Advance audio clock by 0.5 s, then tick the scheduler interval.
    ctx.advance(0.5);
    vi.advanceTimersByTime(25);
    expect(onBeat).toHaveBeenCalledTimes(2);
    expect(onBeat.mock.calls[1][0]).toBe(1);

    ctx.advance(0.5);
    vi.advanceTimersByTime(25);
    expect(onBeat).toHaveBeenCalledTimes(3);
    expect(onBeat.mock.calls[2][0]).toBe(2);
    s.stop();
  });

  it('respects tempoScale — half-speed halves the beat rate', () => {
    const onBeat = vi.fn();
    const s = new BeatScheduler({
      ctx: ctx as unknown as AudioContext,
      onBeat,
      lookaheadSec: 0.1,
      tickMs: 25,
    });
    s.start({ startBeat: 0, bpm: 120, tempoScale: 0.5, totalBeats: 16, loop: null });

    // At 60 eff. BPM, beat spacing is 1 s. At ctx=0 only beat 0 schedules.
    expect(onBeat).toHaveBeenCalledTimes(1);

    // Advance 0.9 s — beat 1 at ~1.02 s is still outside the 0.1 s lookahead.
    ctx.advance(0.9);
    vi.advanceTimersByTime(25);
    expect(onBeat).toHaveBeenCalledTimes(1);

    // At ctx=1.0, beat 1 at ~1.02 is inside lookahead.
    ctx.advance(0.1);
    vi.advanceTimersByTime(25);
    expect(onBeat).toHaveBeenCalledTimes(2);
    expect(onBeat.mock.calls[1][0]).toBe(1);
    s.stop();
  });

  it('loops back to fromBeat when toBeat is reached', () => {
    const onBeat = vi.fn();
    const s = new BeatScheduler({
      ctx: ctx as unknown as AudioContext,
      onBeat,
      lookaheadSec: 0.1,
      tickMs: 25,
    });
    // 2-beat loop 0..2 at 120 BPM — beats 0,1 then 0,1 again.
    s.start({ startBeat: 0, bpm: 120, tempoScale: 1, totalBeats: 100, loop: { fromBeat: 0, toBeat: 2 } });

    // Walk ctx forward a full 4-beat (= 2 loops) span and collect events.
    for (let step = 0; step < 16; step++) {
      ctx.advance(0.125);
      vi.advanceTimersByTime(25);
    }
    const beatsSeen = onBeat.mock.calls.map(([b]) => b);
    // Expect the sequence to include two copies of 0 and 1.
    const zeroCount = beatsSeen.filter((b) => b === 0).length;
    const oneCount = beatsSeen.filter((b) => b === 1).length;
    expect(zeroCount).toBeGreaterThanOrEqual(2);
    expect(oneCount).toBeGreaterThanOrEqual(2);
    // And no beat >= 2 should be emitted (loop wraps before that).
    expect(beatsSeen.every((b) => b < 2)).toBe(true);
    s.stop();
  });

  it('stops at totalBeats and calls onStop once', () => {
    const onBeat = vi.fn();
    const onStop = vi.fn();
    const s = new BeatScheduler({
      ctx: ctx as unknown as AudioContext,
      onBeat,
      onStop,
      lookaheadSec: 0.1,
      tickMs: 25,
    });
    s.start({ startBeat: 0, bpm: 120, tempoScale: 1, totalBeats: 2, loop: null });
    // Walk until past beat 2.
    for (let step = 0; step < 20; step++) {
      ctx.advance(0.1);
      vi.advanceTimersByTime(25);
    }
    const beatsSeen = onBeat.mock.calls.map(([b]) => b);
    expect(beatsSeen).toEqual([0, 1]);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('seek resets the anchor and emits from the new beat', () => {
    const onBeat = vi.fn();
    const s = new BeatScheduler({
      ctx: ctx as unknown as AudioContext,
      onBeat,
      lookaheadSec: 0.1,
      tickMs: 25,
    });
    s.start({ startBeat: 0, bpm: 120, tempoScale: 1, totalBeats: 100, loop: null });
    // Beat 0 fires synchronously.
    expect(onBeat).toHaveBeenCalledTimes(1);

    // Seek forward to beat 10. Next tick should emit 10 next.
    s.seek(10);
    ctx.advance(0.05);
    vi.advanceTimersByTime(25);
    expect(onBeat.mock.calls[1][0]).toBe(10);
    s.stop();
  });
});
