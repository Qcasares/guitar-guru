import { describe, expect, it, beforeEach, vi } from 'vitest';
import { AudioTrack } from '../audio-track';

/** Minimal AudioContext sufficient for AudioTrack's constructor + fadeAround. */
function makeCtx() {
  const gainParam = {
    value: 1,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
  };
  const gain = {
    gain: gainParam,
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  const ctx = {
    currentTime: 0,
    sampleRate: 44100,
    destination: {},
    createGain: vi.fn(() => gain),
    createConstantSource: vi.fn(() => ({
      onended: null as (() => void) | null,
      start: vi.fn(),
      stop: vi.fn(function (this: { onended: (() => void) | null }) {
        // Fire synchronously so fadeAround's promise resolves during the test.
        if (typeof this.onended === 'function') this.onended();
      }),
    })),
  } as unknown as AudioContext;
  return ctx;
}

/** Fake HTMLAudioElement with mutable `paused`, `currentTime`, `playbackRate`. */
function makeFakeAudioEl(): HTMLAudioElement {
  const el: Record<string, unknown> = {
    paused: false,
    currentTime: 0,
    playbackRate: 1,
    crossOrigin: null,
    preload: 'auto',
    preservesPitch: true,
    src: '',
    duration: 60,
    error: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    pause: vi.fn(),
    play: vi.fn(async () => {}),
    load: vi.fn(),
    removeAttribute: vi.fn(),
  };
  return el as unknown as HTMLAudioElement;
}

describe('AudioTrack drift control', () => {
  let perfNow = 0;
  beforeEach(() => {
    perfNow = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => perfNow);
  });

  it('classifies drift into three branches', () => {
    const ctx = makeCtx();
    const track = new AudioTrack({ audioContext: ctx, audioElForTests: makeFakeAudioEl() });
    expect(track.classifyDrift(0.005)).toBe('none');
    expect(track.classifyDrift(-0.005)).toBe('none');
    expect(track.classifyDrift(0.05)).toBe('rate-nudge');
    expect(track.classifyDrift(-0.10)).toBe('rate-nudge');
    expect(track.classifyDrift(0.20)).toBe('hard-seek');
    expect(track.classifyDrift(-0.30)).toBe('hard-seek');
  });

  it('small drift nudges playbackRate, does not re-seek', () => {
    const ctx = makeCtx();
    const el = makeFakeAudioEl();
    const track = new AudioTrack({ audioContext: ctx, audioElForTests: el });
    // Seed expectations: at t=0 we expect position 10.0 with scale 1, so elapsed*1 = 0.
    (track as unknown as { expectedStartSec: number; expectedStartedAt: number; tempoScale: number })
      .expectedStartSec = 10.0;
    (track as unknown as { expectedStartedAt: number }).expectedStartedAt = 0;
    (track as unknown as { tempoScale: number }).tempoScale = 1;

    // actual = 10.05 → drift = +0.05 (audio ahead) → rate-nudge branch.
    perfNow = 0;
    const originalCurrentTime = el.currentTime;
    const action = track._driftStepForTests(perfNow, 10.05);
    expect(action).toBe('rate-nudge');
    // currentTime must NOT be rewritten.
    expect(el.currentTime).toBe(originalCurrentTime);
    // playbackRate should have shifted below 1 (slowing down, since audio ran ahead).
    expect(el.playbackRate).toBeLessThan(1);
    expect(el.playbackRate).toBeGreaterThanOrEqual(0.97);
  });

  it('large drift hard-seeks the audio element', async () => {
    const ctx = makeCtx();
    const el = makeFakeAudioEl();
    const track = new AudioTrack({ audioContext: ctx, audioElForTests: el });
    (track as unknown as { expectedStartSec: number; expectedStartedAt: number; tempoScale: number })
      .expectedStartSec = 10.0;
    (track as unknown as { expectedStartedAt: number }).expectedStartedAt = 0;
    (track as unknown as { tempoScale: number }).tempoScale = 1;

    perfNow = 0;
    const action = track._driftStepForTests(perfNow, 10.5);
    expect(action).toBe('hard-seek');
    // fadeAround runs the seek after a microtask — flush it.
    await Promise.resolve();
    await Promise.resolve();
    // expected = 10.0 so a hard seek resets currentTime to ~10.0.
    expect(el.currentTime).toBeCloseTo(10.0, 2);
    // playbackRate should be restored to the nominal tempo scale.
    expect(el.playbackRate).toBe(1);
  });

  it('returns to nominal rate once drift has been absorbed', () => {
    const ctx = makeCtx();
    const el = makeFakeAudioEl();
    const track = new AudioTrack({ audioContext: ctx, audioElForTests: el });
    (track as unknown as { expectedStartSec: number; expectedStartedAt: number; tempoScale: number })
      .expectedStartSec = 0;
    (track as unknown as { expectedStartedAt: number }).expectedStartedAt = 0;
    (track as unknown as { tempoScale: number }).tempoScale = 1;

    // Drift into rate-nudge.
    perfNow = 0;
    track._driftStepForTests(perfNow, 0.05);
    expect(el.playbackRate).not.toBe(1);

    // Step forward past the 400 ms hold with the audio caught up (~0 drift).
    perfNow = 500;
    // actual should match expected (= 0 + elapsed * 1 = 0.5s).
    const action = track._driftStepForTests(perfNow, 0.5);
    expect(action).toBe('none');
    expect(el.playbackRate).toBe(1);
  });

  it('skips the step when the element is paused', () => {
    const ctx = makeCtx();
    const el = makeFakeAudioEl();
    (el as unknown as { paused: boolean }).paused = true;
    const track = new AudioTrack({ audioContext: ctx, audioElForTests: el });
    expect(track._driftStepForTests(0, 10)).toBe('paused');
  });
});
