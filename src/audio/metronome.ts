// Web Audio metronome — a short square-wave blip plus a bandpassed noise burst
// so the tick reads as a woodblock transient instead of a pure beep.
//
// Accepts a `when` (AudioContext time) so the scheduler can schedule ahead;
// defaults to `ctx.currentTime` for the legacy immediate-click callers
// (count-in, dispatchVoiceCommand).

import { getSharedCtx } from './audio-context';

// One shared white-noise buffer for the transient.
let noiseBuf: AudioBuffer | null = null;
function getNoise(ctx: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  const len = Math.max(256, Math.floor(ctx.sampleRate * 0.02));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noiseBuf = buf;
  return buf;
}

export interface ClickOpts {
  accent?: boolean;
  gain?: number;
  /** AudioContext time at which to schedule the click. Defaults to now. */
  when?: number;
}

export function click(options: ClickOpts = {}): void {
  const { accent = false, gain = 0.35 } = options;
  const { ctx, master } = getSharedCtx();
  const when = options.when ?? ctx.currentTime;

  // Square-wave blip — the pitched body of the tick.
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.value = accent ? 980 : 620;

  const blipGain = ctx.createGain();
  blipGain.gain.setValueAtTime(0.0001, when);
  blipGain.gain.exponentialRampToValueAtTime(gain, when + 0.005);
  blipGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.08);
  osc.connect(blipGain).connect(master);
  osc.start(when);
  osc.stop(when + 0.1);

  // Bandpassed noise burst — 5 ms transient that makes the tick read woody.
  const noise = ctx.createBufferSource();
  noise.buffer = getNoise(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = accent ? 4000 : 2500;
  bp.Q.value = 1.2;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.0001, when);
  noiseGain.gain.exponentialRampToValueAtTime(gain * 0.6, when + 0.001);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.005);
  noise.connect(bp).connect(noiseGain).connect(master);
  noise.start(when);
  noise.stop(when + 0.02);
}

/** Idempotent — ensures the shared AudioContext is built and running. */
export function primeAudio(): void {
  getSharedCtx();
}
