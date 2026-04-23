import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ChordShape } from '../../music/types';

// --- Mock the shared audio graph so synth sees our fake nodes. ---

interface Call {
  name: string;
  args: unknown[];
}

function makeParam(initial = 0): AudioParam & { _calls: Call[]; value: number } {
  const calls: Call[] = [];
  const record = (name: string, args: unknown[]): void => {
    calls.push({ name, args });
  };
  const p = {
    value: initial,
    _calls: calls,
    setValueAtTime: vi.fn((v: number, t: number) => {
      record('setValueAtTime', [v, t]);
      p.value = v;
      return p;
    }),
    linearRampToValueAtTime: vi.fn((v: number, t: number) => {
      record('linearRampToValueAtTime', [v, t]);
      return p;
    }),
    exponentialRampToValueAtTime: vi.fn((v: number, t: number) => {
      record('exponentialRampToValueAtTime', [v, t]);
      return p;
    }),
    setTargetAtTime: vi.fn((v: number, t: number, tc: number) => {
      record('setTargetAtTime', [v, t, tc]);
      return p;
    }),
    cancelScheduledValues: vi.fn(() => p),
  } as unknown as AudioParam & { _calls: Call[]; value: number };
  return p;
}

function makeNode(kind: string, extras: Record<string, unknown> = {}): Record<string, unknown> {
  const node = {
    _kind: kind,
    connect: vi.fn(function connect(this: unknown, dest: unknown) {
      return dest;
    }),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    ...extras,
  };
  return node;
}

const createdPanners: Array<{ pan: ReturnType<typeof makeParam> }> = [];
const createdOscillators: Array<Record<string, unknown>> = [];
const createdBufferSources: Array<Record<string, unknown>> = [];

function buildMockCtx(): AudioContext {
  const ctx = {
    currentTime: 0,
    sampleRate: 44100,
    destination: makeNode('Destination'),
    createGain: vi.fn(() => makeNode('Gain', { gain: makeParam(1) })),
    createBiquadFilter: vi.fn(() =>
      makeNode('BiquadFilter', {
        type: 'lowpass',
        frequency: makeParam(350),
        Q: makeParam(1),
        gain: makeParam(0),
      }),
    ),
    createDelay: vi.fn(() => makeNode('Delay', { delayTime: makeParam(0) })),
    createOscillator: vi.fn(() => {
      const n = makeNode('Oscillator', { type: 'sine', frequency: makeParam(440) });
      createdOscillators.push(n);
      return n;
    }),
    createBufferSource: vi.fn(() => {
      const n = makeNode('BufferSource', { buffer: null });
      createdBufferSources.push(n);
      return n;
    }),
    createStereoPanner: vi.fn(() => {
      const pan = makeParam(0);
      const n = makeNode('StereoPanner', { pan });
      createdPanners.push({ pan });
      return n;
    }),
    createBuffer: vi.fn((channels: number, len: number, sampleRate: number) => ({
      sampleRate,
      numberOfChannels: channels,
      length: len,
      getChannelData: vi.fn(() => new Float32Array(len)),
    })),
    createConvolver: vi.fn(() =>
      makeNode('Convolver', { buffer: null }),
    ),
  } as unknown as AudioContext;
  return ctx;
}

const mockShared = vi.hoisted(() => ({ ctx: null as AudioContext | null, master: null as unknown, reverbSend: null as unknown }));

vi.mock('../audio-context', () => ({
  getSharedCtx: () => {
    if (!mockShared.ctx) {
      mockShared.ctx = buildMockCtx();
      mockShared.master = { connect: vi.fn(), disconnect: vi.fn(), _kind: 'MasterGain' };
      mockShared.reverbSend = { connect: vi.fn(), disconnect: vi.fn(), _kind: 'ReverbSend' };
    }
    return { ctx: mockShared.ctx, master: mockShared.master, reverbSend: mockShared.reverbSend };
  },
  primeSharedAudio: () => {
    /* no-op */
  },
  __resetSharedCtxForTests: () => {
    mockShared.ctx = null;
  },
}));

import { strum, setHumanizationSeed } from '../synth';

// String -> expected pan (from synth.ts STRING_PAN).
const EXPECTED_PAN: Record<number, number> = {
  6: -0.45,
  5: -0.27,
  4: -0.09,
  3: +0.09,
  2: +0.27,
  1: +0.45,
};

function openSixStringChord(): ChordShape {
  return {
    name: 'TEST',
    frets: 4,
    notes: [
      { string: 6, fret: 0, open: true },
      { string: 5, fret: 0, open: true },
      { string: 4, fret: 0, open: true },
      { string: 3, fret: 0, open: true },
      { string: 2, fret: 0, open: true },
      { string: 1, fret: 0, open: true },
    ],
  };
}

describe('strum', () => {
  beforeEach(() => {
    createdPanners.length = 0;
    createdOscillators.length = 0;
    createdBufferSources.length = 0;
    setHumanizationSeed(0x1a2b3c4d);
    vi.useFakeTimers();
  });

  it('creates one StereoPanner per voiced string and pans them across the stereo field', () => {
    const chord = openSixStringChord();
    strum(chord, { direction: 'down', when: 0, spread: 0.015 });

    expect(createdPanners.length).toBe(6);
    // Strum order is low-to-high for down: [6,5,4,3,2,1].
    const order = [6, 5, 4, 3, 2, 1];
    order.forEach((stringNum, i) => {
      expect(createdPanners[i].pan.value).toBeCloseTo(EXPECTED_PAN[stringNum], 3);
    });
  });

  it('reverses string order on upstrokes', () => {
    const chord = openSixStringChord();
    strum(chord, { direction: 'up', when: 0, spread: 0.015 });

    const order = [1, 2, 3, 4, 5, 6];
    order.forEach((stringNum, i) => {
      expect(createdPanners[i].pan.value).toBeCloseTo(EXPECTED_PAN[stringNum], 3);
    });
  });

  it('produces pluck voice graphs — at least one BufferSource per string', () => {
    const chord = openSixStringChord();
    strum(chord, { direction: 'down', when: 0 });
    // Each pluck uses 2 BufferSources (noise excitation + pick click).
    expect(createdBufferSources.length).toBeGreaterThanOrEqual(6);
  });
});
